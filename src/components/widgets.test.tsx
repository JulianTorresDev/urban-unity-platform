/**
 * HU-12 y HU-17 — Calendario de disponibilidad y campana de notificaciones.
 */
import '@/test/pageSetup';
import { sb, setUser, resetAll } from '@/test/supabaseMock';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AvailabilityCalendar } from './reservations/AvailabilityCalendar';
import { NotificationsBell } from './NotificationsBell';
import { MemoryRouter } from 'react-router-dom';

beforeEach(() => {
  resetAll();
  setUser('ana');
});

describe('Calendario de disponibilidad', () => {
  // Lunes 9 de noviembre de 2026, 12:30 hora local
  const NOW = new Date(2026, 10, 9, 12, 30);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    sb.rows.reservations = [
      { id: 'r1', resource_id: 'salon', status: 'confirmed', start_time: new Date(2026, 10, 9, 15).toISOString(), end_time: new Date(2026, 10, 9, 17).toISOString() },
    ];
  });
  afterEach(() => vi.useRealTimers());

  const slot = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) });

  test('UI-K01 marca como ocupados los turnos que ya tienen reserva', async () => {
    render(<AvailabilityCalendar resourceId="salon" resourceName="Salón Social" />);
    await waitFor(() => expect(slot('3:00 PM')).toHaveTextContent('Ocupado'));
    expect(slot('3:00 PM')).toBeDisabled();
    expect(slot('4:00 PM')).toBeDisabled();
    expect(slot('5:00 PM')).toHaveTextContent('Libre');
  });

  test('UI-K02 los turnos que ya pasaron no se pueden elegir', async () => {
    render(<AvailabilityCalendar resourceId="salon" resourceName="Salón Social" />);
    await waitFor(() => expect(slot('9:00 AM')).toHaveTextContent('Pasado'));
    expect(slot('9:00 AM')).toBeDisabled();
  });

  test('UI-K03 elegir un turno libre lo devuelve al formulario', async () => {
    const onSelectSlot = vi.fn();
    render(<AvailabilityCalendar resourceId="salon" resourceName="Salón Social" onSelectSlot={onSelectSlot} />);
    await waitFor(() => expect(slot('6:00 PM')).toBeEnabled());
    await userEvent.click(slot('6:00 PM'));
    expect(onSelectSlot).toHaveBeenCalledWith(expect.any(Date), 18);
  });

  test('UI-K04 solo consulta reservas vigentes del área elegida', async () => {
    render(<AvailabilityCalendar resourceId="salon" resourceName="Salón Social" />);
    await waitFor(() => expect(sb.reads('reservations')).toHaveLength(1));
    const { filters } = sb.reads('reservations')[0];
    expect(filters).toContainEqual(['eq', ['resource_id', 'salon']]);
    expect(filters).toContainEqual(['in', ['status', ['pending', 'confirmed']]]);
  });
});

describe('Campana de notificaciones', () => {
  beforeEach(() => {
    sb.rows.notifications = [
      { id: 'n1', user_id: 'ana', title: 'Alícuota aprobada', message: 'Gracias por tu pago', type: 'success', link: '/dues', is_read: false, created_at: new Date().toISOString() },
      { id: 'n2', user_id: 'ana', title: 'Reserva confirmada', message: 'Salón social el viernes', type: 'success', link: '/reservations', is_read: true, created_at: new Date().toISOString() },
    ];
  });

  const open = async () => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><NotificationsBell /></MemoryRouter>);
    const bell = screen.getByRole('button', { name: 'Notificaciones' });
    await waitFor(() => expect(within(bell).getByText('1')).toBeInTheDocument());
    await userEvent.click(bell);
  };

  test('UI-B01 muestra el contador de no leídas y la lista', async () => {
    await open();
    expect(await screen.findByText('Alícuota aprobada')).toBeInTheDocument();
    expect(screen.getByText('1 sin leer')).toBeInTheDocument();
  });

  test('UI-B02 "Marcar todas" deja el contador en cero al instante', async () => {
    await open();
    await userEvent.click(await screen.findByRole('button', { name: /marcar todas/i }));
    expect(await screen.findByText('Todo al día')).toBeInTheDocument();
    expect(sb.writes('notifications', 'update')[0]).toMatchObject({
      payload: { is_read: true },
      filters: [['eq', ['user_id', 'ana']], ['eq', ['is_read', false]]],
    });
  });

  test('UI-B03 eliminar quita la notificación de la lista', async () => {
    await open();
    await screen.findByText('Reserva confirmada');
    const [, second] = screen.getAllByRole('button', { name: 'Eliminar' });
    await userEvent.click(second);
    await waitFor(() => expect(screen.queryByText('Reserva confirmada')).not.toBeInTheDocument());
    expect(sb.writes('notifications', 'delete')[0].filters).toContainEqual(['eq', ['id', 'n2']]);
  });
});
