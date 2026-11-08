/**
 * HU-26 a HU-34 — Administración: reservas, solicitudes, áreas, residentes, pases, garita, marca y reportes.
 */
import '@/test/pageSetup';
import { renderPage, futureAt } from '@/test/pageSetup';
import { sb, setUser, resetAll, toasts, theme } from '@/test/supabaseMock';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const qr = vi.hoisted(() => ({ payload: '' }));

// Cámara simulada: al encenderla "lee" el contenido configurado en qr.payload
vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {
    isScanning = false;
    static getCameras = async () => [{ id: 'cam', label: 'Trasera' }];
    async start(_cam: unknown, _cfg: unknown, onSuccess: (text: string) => void) {
      this.isScanning = true;
      setTimeout(() => onSuccess(qr.payload), 0);
    }
    async stop() { this.isScanning = false; }
  },
}));

import ManageReservations from './ManageReservations';
import ManageTickets from './ManageTickets';
import ManageResources from './ManageResources';
import ManageUsers from './ManageUsers';
import ManageAccess from './ManageAccess';
import AdminSettings from './AdminSettings';
import VerifyQR from './VerifyQR';
import ReservationReports from './ReservationReports';

const salon = { id: 'salon', name: 'Salón Social', description: 'Eventos', base_price: 25, price_per_hour: 0, max_hours_per_booking: 4, available_from: '08:00', available_until: '22:00' };

beforeEach(() => {
  resetAll();
  setUser('admin', 'admin');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  sb.rows.profiles = [
    { id: 'ana', full_name: 'Ana Pérez', email: 'ana@gissels2.test', apartment_number: '12', phone: null, nfc_card_id: null, status: 'active', created_at: new Date().toISOString() },
    { id: 'admin', full_name: 'Administración', email: 'admin@gissels2.test', apartment_number: null, phone: null, nfc_card_id: null, status: 'active', created_at: new Date().toISOString() },
  ];
  sb.rows.resources = [salon];
});

const notifications = () => sb.writes('notifications', 'insert').map((c) => c.payload as Record<string, unknown>);

describe('Gestión de reservas', () => {
  beforeEach(() => {
    sb.rows.reservations = [
      { id: 'res-1', resource_id: 'salon', user_id: 'ana', status: 'pending', start_time: futureAt(3, 10), end_time: futureAt(3, 12), notes: 'Cumpleaños', price: 25, rejection_reason: null, resources: salon },
    ];
  });

  test('UI-R01 autoriza una reserva y avisa al residente', async () => {
    renderPage(<ManageReservations />);
    await userEvent.click(await screen.findByRole('button', { name: /autorizar/i }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Reserva aprobada exitosamente'));
    expect(sb.writes('reservations', 'update')[0].payload).toEqual({ status: 'confirmed' });
    expect(notifications()[0]).toMatchObject({ user_id: 'ana', title: 'Reserva confirmada', link: '/reservations' });
  });

  test('UI-R02 rechaza con motivo: queda "rechazada" (no "cancelada") y el residente recibe el motivo', async () => {
    renderPage(<ManageReservations />);
    await userEvent.click(await screen.findByRole('button', { name: /^rechazar$/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'Mantenimiento del salón');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar rechazo' }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Reserva rechazada'));
    expect(sb.writes('reservations', 'update')[0].payload).toEqual({ status: 'rejected', rejection_reason: 'Mantenimiento del salón' });
    expect(notifications()[0]).toMatchObject({ user_id: 'ana', title: 'Reserva rechazada', message: expect.stringContaining('Motivo: Mantenimiento del salón') });
  });

  test('UI-R03 si la base rechaza la aprobación (cruce de horario), muestra el motivo y no notifica', async () => {
    sb.fail('reservations.update', 'Este espacio ya se encuentra reservado en ese horario');
    renderPage(<ManageReservations />);
    await userEvent.click(await screen.findByRole('button', { name: /autorizar/i }));
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith(expect.stringContaining('ya se encuentra reservado')));
    expect(notifications()).toHaveLength(0);
  });
});

describe('Atención de solicitudes', () => {
  beforeEach(() => {
    sb.rows.tickets = [{ id: 't1', user_id: 'ana', subject: 'Fuga en el pasillo', description: 'Agua en el piso', category: 'maintenance', status: 'open', admin_notes: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }];
  });

  test('UI-S01 responde una solicitud, cambia su estado y avisa al residente', async () => {
    renderPage(<ManageTickets />);
    await userEvent.click(await screen.findByRole('button', { name: /gestionar/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Resuelta' }));
    await userEvent.type(within(dialog).getByRole('textbox'), 'Se cambió la tubería');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar respuesta' }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Ticket respondido y actualizado con éxito'));
    expect(sb.writes('tickets', 'update')[0].payload).toMatchObject({ status: 'resolved', admin_notes: 'Se cambió la tubería' });
    expect(notifications()[0]).toMatchObject({ user_id: 'ana', message: '"Fuga en el pasillo" ahora está resuelta.', type: 'success' });
  });
});

describe('Áreas y tarifas', () => {
  const openEdit = async () => {
    renderPage(<ManageResources />);
    await userEvent.click(await screen.findByRole('button', { name: /modificar tarifas/i }));
    return screen.findByRole('dialog');
  };

  test('UI-A01 actualiza la tarifa de un área', async () => {
    const dialog = await openEdit();
    const base = within(dialog).getByLabelText(/precio base/i);
    await userEvent.clear(base);
    await userEvent.type(base, '30');
    await userEvent.click(within(dialog).getByRole('button', { name: /guardar/i }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Configuración actualizada con éxito'));
    expect(sb.writes('resources', 'update')[0].payload).toMatchObject({ base_price: 30, price_per_hour: 0, max_hours_per_booking: 4 });
  });

  test.each([
    ['precio negativo', /precio base/i, '-5', 'Los precios no pueden ser negativos'],
    ['más de 24 horas', /máximo de horas/i, '30', 'El máximo por reserva debe estar entre 1 y 24 horas'],
  ])('UI-A02 no guarda valores inválidos (%s)', async (_l, label, value, message) => {
    const dialog = await openEdit();
    const input = within(dialog).getByLabelText(label);
    await userEvent.clear(input);
    await userEvent.type(input, value);
    await userEvent.click(within(dialog).getByRole('button', { name: /guardar/i }));
    expect(toasts.error).toHaveBeenCalledWith(message);
    expect(sb.writes('resources')).toHaveLength(0);
  });
});

describe('Residentes', () => {
  beforeEach(() => {
    sb.rows.user_roles = [{ user_id: 'ana', role: 'resident' }, { user_id: 'admin', role: 'admin' }];
    sb.rows.access_tokens = [{ user_id: 'ana', token: 'tok-ana', type: 'permanent' }];
    sb.client.functions.invoke.mockReset();
  });

  test('UI-U01 registra un residente con la función create-resident, sin cerrar la sesión del administrador', async () => {
    sb.client.functions.invoke.mockResolvedValue({ data: { id: 'nuevo' }, error: null });
    renderPage(<ManageUsers />);
    await userEvent.click(await screen.findByRole('button', { name: /registrar residente/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/nombre completo/i), 'Luis Andrade');
    await userEvent.type(within(dialog).getByLabelText(/correo/i), 'luis@correo.com');
    await userEvent.type(within(dialog).getByLabelText(/contraseña/i), 'Inicial2026!');
    await userEvent.type(within(dialog).getByLabelText(/departamento/i), '78');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear residente' }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Residente creado. Su código QR permanente ya está disponible.'));
    expect(sb.client.auth.signUp).not.toHaveBeenCalled();
    expect(sb.client.functions.invoke).toHaveBeenCalledWith('create-resident', {
      body: expect.objectContaining({ fullName: 'Luis Andrade', email: 'luis@correo.com', apartment: '78' }),
    });
  });

  test('UI-U02 suspende a un residente', async () => {
    renderPage(<ManageUsers />);
    const row = (await screen.findAllByText('Ana Pérez'))[0].closest('div[class*="p-"]') ?? document.body;
    const suspend = within(row as HTMLElement).queryByRole('button', { name: /suspender/i }) ?? screen.getAllByRole('button', { name: /suspender/i })[0];
    await userEvent.click(suspend);
    await waitFor(() => expect(sb.writes('profiles', 'update')).toHaveLength(1));
    expect(sb.writes('profiles', 'update')[0]).toMatchObject({ payload: { status: 'blocked' }, filters: [['eq', ['id', 'ana']]] });
  });

  test('UI-U03 no muestra botón de suspender sobre la propia cuenta', async () => {
    renderPage(<ManageUsers />);
    await screen.findAllByText('Ana Pérez');
    expect(screen.getAllByRole('button', { name: /suspender/i })).toHaveLength(1);
  });
});

describe('Pases de acceso', () => {
  beforeEach(() => {
    sb.rows.access_codes = [
      { id: 'c-ok', code: 'ACC-VIGENTE1', type: 'visitor', visitor_name: 'Técnico', user_id: 'ana', is_active: true, expires_at: futureAt(1, 18), created_at: new Date().toISOString() },
      { id: 'c-old', code: 'ACC-VENCIDO1', type: 'visitor', visitor_name: 'Mudanza', user_id: null, is_active: true, expires_at: new Date(Date.now() - 3.6e6).toISOString(), created_at: new Date().toISOString() },
    ];
    sb.rows.access_logs = [];
  });

  test('UI-X01 no emite un pase de visitante sin nombre', async () => {
    renderPage(<ManageAccess />);
    await userEvent.click(await screen.findByRole('button', { name: /nuevo pase qr/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Generar pase' })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/nombre del visitante/i), '   ');
    expect(within(dialog).getByRole('button', { name: 'Generar pase' })).toBeDisabled();
    expect(sb.writes('access_codes')).toHaveLength(0);
  });

  test('UI-X02 emite un pase de visitante con código aleatorio y vigencia de 24 h', async () => {
    renderPage(<ManageAccess />);
    await userEvent.click(await screen.findByRole('button', { name: /nuevo pase qr/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/nombre del visitante/i), 'Técnico de internet');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Generar pase' }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Pase de acceso generado correctamente'));
    const pass = sb.writes('access_codes', 'insert')[0].payload as Record<string, string>;
    expect(pass.code).toMatch(/^ACC-[0-9A-Z]{8}$/);
    expect(pass).toMatchObject({ type: 'visitor', visitor_name: 'Técnico de internet', created_by: 'admin', is_active: true });
    const hours = (new Date(pass.expires_at).getTime() - Date.now()) / 3.6e6;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
  });

  test('UI-X03 registra la entrada de un pase vigente en la bitácora', async () => {
    renderPage(<ManageAccess />);
    await userEvent.click(await screen.findByRole('button', { name: /validar manualmente/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'ACC-VIGENTE1');
    await userEvent.click(within(dialog).getByRole('button', { name: /registrar entrada/i }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith(expect.stringContaining('Entrada registrada')));
    expect(sb.writes('access_logs', 'insert')[0].payload).toEqual({ access_code_id: 'c-ok', direction: 'entry', scanned_by: 'admin' });
  });

  test('UI-X04 rechaza un pase vencido', async () => {
    renderPage(<ManageAccess />);
    await userEvent.click(await screen.findByRole('button', { name: /validar manualmente/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'ACC-VENCIDO1');
    await userEvent.click(within(dialog).getByRole('button', { name: /registrar entrada/i }));
    expect(toasts.error).toHaveBeenCalledWith('Este pase ha expirado');
    expect(sb.writes('access_logs')).toHaveLength(0);
  });
});

describe('Garita QR', () => {
  beforeEach(() => {
    sb.rows.access_tokens = [
      { token: 'tok-ana', user_id: 'ana', type: 'permanent', expires_at: null, profiles: { full_name: 'Ana Pérez', apartment_number: '12', status: 'active' } },
      { token: 'tok-moroso', user_id: 'carlos', type: 'permanent', expires_at: null, profiles: { full_name: 'Carlos Mora', apartment_number: '56', status: 'blocked' } },
      { token: 'tok-vencido', user_id: 'vis', type: 'temporary', expires_at: new Date(Date.now() - 60000).toISOString(), profiles: { full_name: 'Visita', apartment_number: '12', status: 'active' } },
    ];
  });

  const scan = async (payload: string) => {
    qr.payload = payload;
    renderPage(<VerifyQR />);
    await userEvent.click(await screen.findByRole('button', { name: /encender cámara/i }));
  };

  test('UI-G01 autoriza a un residente al día', async () => {
    await scan(JSON.stringify({ t: 'tok-ana', u: 'ana', a: '12' }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Acceso autorizado'));
    expect(screen.getAllByText('Ana Pérez').length).toBeGreaterThan(0);
  });

  test('UI-G02 niega el acceso a un residente suspendido', async () => {
    await scan(JSON.stringify({ t: 'tok-moroso' }));
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith('Residente suspendido: acceso denegado'));
  });

  test('UI-G03 niega un pase temporal vencido', async () => {
    await scan('tok-vencido');
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith('Acceso denegado: código vencido'));
  });

  test('UI-G04 niega un código desconocido', async () => {
    await scan('cualquier-cosa');
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith('Acceso denegado: código no válido'));
  });
});

describe('Marca del conjunto', () => {
  test('UI-W01 guarda el nombre y color del conjunto', async () => {
    renderPage(<AdminSettings />);
    const name = await screen.findByLabelText(/nombre/i);
    await userEvent.clear(name);
    await userEvent.type(name, 'Conjunto Gissel’s 2');
    await userEvent.click(screen.getAllByRole('button', { name: /guardar y aplicar/i })[0]);
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Cambios guardados.'));
    expect(theme.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ company_name: 'Conjunto Gissel’s 2' }));
  });

  test('UI-W02 no permite dejar el nombre vacío', async () => {
    renderPage(<AdminSettings />);
    await userEvent.clear(await screen.findByLabelText(/nombre/i));
    await userEvent.click(screen.getAllByRole('button', { name: /guardar y aplicar/i })[0]);
    expect(toasts.error).toHaveBeenCalledWith('El nombre de la comunidad no puede estar vacío');
    expect(theme.updateSettings).not.toHaveBeenCalled();
  });
});

describe('Reporte de reservas', () => {
  test('UI-E01 resume solicitudes, recaudación y pendientes del periodo', async () => {
    sb.rows.reservations = [
      { id: 'a', resource_id: 'salon', status: 'confirmed', price: 25, start_time: futureAt(1, 10), end_time: futureAt(1, 12), resources: salon },
      { id: 'b', resource_id: 'salon', status: 'confirmed', price: 25, start_time: futureAt(2, 10), end_time: futureAt(2, 12), resources: salon },
      { id: 'c', resource_id: 'salon', status: 'pending', price: 25, start_time: futureAt(3, 10), end_time: futureAt(3, 12), resources: salon },
      { id: 'd', resource_id: 'salon', status: 'rejected', price: 25, start_time: futureAt(4, 10), end_time: futureAt(4, 12), resources: salon },
    ];
    renderPage(<ReservationReports />);
    const total = (await screen.findByText('Total solicitudes')).parentElement!;
    expect(within(total).getByText('4')).toBeInTheDocument();
    const revenue = screen.getByText('Recaudado').parentElement!;
    expect(within(revenue).getByText(/\$50\.00/)).toBeInTheDocument(); // solo las confirmadas
    const pending = screen.getByText('Por aprobar').parentElement!;
    expect(within(pending).getByText('1')).toBeInTheDocument();
  });
});
