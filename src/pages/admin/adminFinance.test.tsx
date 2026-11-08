/**
 * HU-21 a HU-25 — Administración: verificación de comprobantes, emisión de alícuotas y cobranza.
 */
import '@/test/pageSetup';
import { renderPage } from '@/test/pageSetup';
import { sb, setUser, resetAll, toasts } from '@/test/supabaseMock';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminOverview from './AdminOverview';
import ManageDues from './ManageDues';
import ManagePayments from './ManagePayments';
import { DEFAULT_REJECTION_REASON } from '@/lib/receiptReview';

const now = new Date();
const M = now.getMonth() + 1;
const Y = now.getFullYear();

const profiles = [
  { id: 'ana', full_name: 'Ana Pérez', email: 'ana@gissels2.test', apartment_number: '12', apartment_type_id: 'tipo-2h', status: 'active' },
  { id: 'bruno', full_name: 'Bruno Ruiz', email: 'bruno@gissels2.test', apartment_number: '34', apartment_type_id: 'tipo-2h', status: 'active' },
  { id: 'carla', full_name: 'Carla Mora', email: 'carla@gissels2.test', apartment_number: '56', apartment_type_id: null, status: 'active' },
];

beforeEach(() => {
  resetAll();
  setUser('admin', 'admin');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  sb.rows.profiles = profiles;
  sb.rows.apartment_types = [{ id: 'tipo-2h', name: 'Estándar 2 habitaciones', monthly_fee: 50, description: null }];
  sb.rows.dues = [
    { id: 'due-ana', user_id: 'ana', amount: 50, month: M, year: Y, status: 'pending', receipt_url: 'https://cdn.test/receipts/ana/due.pdf', rejection_reason: null, created_at: now.toISOString() },
    { id: 'due-bruno', user_id: 'bruno', amount: 50, month: M, year: Y, status: 'paid', receipt_url: 'https://cdn.test/receipts/bruno/due.pdf', paid_at: now.toISOString(), created_at: now.toISOString() },
  ];
  sb.rows.payments = [];
  sb.rows.tickets = [];
});

const notificationTo = (userId: string) =>
  sb.writes('notifications', 'insert').map((c) => c.payload as Record<string, unknown>).find((p) => p.user_id === userId);

describe('Resumen: cola de comprobantes', () => {
  test('UI-O01 muestra las métricas y solo los comprobantes por revisar', async () => {
    renderPage(<AdminOverview />);
    expect(await screen.findByText('Comprobantes por revisar')).toBeInTheDocument();
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.queryByText('Bruno Ruiz')).not.toBeInTheDocument(); // ya pagada
  });

  test('UI-O02 aprobar marca la alícuota como pagada y avisa al residente', async () => {
    renderPage(<AdminOverview />);
    await screen.findByText('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Alícuota de Ana Pérez aprobada.'));
    const upd = sb.writes('dues', 'update')[0];
    expect(upd.payload).toMatchObject({ status: 'paid', rejection_reason: null, paid_at: expect.any(String) });
    expect(upd.filters).toContainEqual(['eq', ['id', 'due-ana']]);
    expect(notificationTo('ana')).toMatchObject({ type: 'success', link: '/dues' });
  });

  test('UI-O03 rechazar quita el comprobante, guarda el motivo y avisa (antes quedaba "en revisión")', async () => {
    renderPage(<AdminOverview />);
    await screen.findByText('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    await waitFor(() => expect(toasts.warning).toHaveBeenCalled());
    expect(sb.writes('dues', 'update')[0].payload).toEqual({
      status: 'pending', receipt_url: null, rejection_reason: DEFAULT_REJECTION_REASON,
    });
    expect(notificationTo('ana')).toMatchObject({ type: 'warning' });
  });

  test('UI-O04 si aprobar falla, no notifica al residente', async () => {
    sb.fail('dues.update', 'permission denied');
    renderPage(<AdminOverview />);
    await screen.findByText('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith('Error al aprobar: permission denied'));
    expect(sb.writes('notifications')).toHaveLength(0);
  });
});

describe('Alícuotas (administración)', () => {
  test('UI-M01 aprueba un comprobante desde la tabla del mes', async () => {
    renderPage(<ManageDues />);
    await screen.findAllByText('Ana Pérez');
    await userEvent.click(screen.getAllByRole('button', { name: 'Aprobar' })[0]);
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Alícuota aprobada.'));
    expect(sb.writes('dues', 'update')[0].payload).toMatchObject({ status: 'paid' });
    expect(notificationTo('ana')?.title).toMatch(/Alícuota aprobada/);
  });

  test('UI-M02 rechaza un comprobante y lo saca de la cola', async () => {
    renderPage(<ManageDues />);
    await screen.findAllByText('Ana Pérez');
    await userEvent.click(screen.getAllByRole('button', { name: 'Rechazar' })[0]);
    await waitFor(() => expect(toasts.warning).toHaveBeenCalledWith('Comprobante rechazado. Se notificó al residente.'));
    expect(sb.writes('dues', 'update')[0].payload).toMatchObject({ status: 'pending', receipt_url: null });
  });

  test('UI-M03 reabre una alícuota pagada por error', async () => {
    renderPage(<ManageDues />);
    await screen.findAllByText('Bruno Ruiz');
    await userEvent.click(screen.getByRole('button', { name: 'Reabrir' }));
    await waitFor(() => expect(toasts.info).toHaveBeenCalledWith('Alícuota reabierta como pendiente'));
    expect(sb.writes('dues', 'update')[0].payload).toEqual({ status: 'pending', paid_at: null });
  });

  test('UI-M04 emite las alícuotas del mes según el tipo de departamento y omite las repetidas', async () => {
    let calls = 0;
    const originalFrom = sb.client.from.getMockImplementation()!;
    // La segunda inserción simula una alícuota que ya existía (índice único)
    sb.client.from.mockImplementation((table: string) => {
      if (table === 'dues') {
        const b = originalFrom(table) as { insert: (p: unknown) => unknown };
        const insert = b.insert;
        b.insert = (p: unknown) => {
          calls += 1;
          if (calls === 2) sb.fail('dues.insert', 'duplicate key value', '23505');
          return insert(p);
        };
        return b;
      }
      return originalFrom(table);
    });

    renderPage(<ManageDues />);
    await screen.findAllByText('Ana Pérez');
    await userEvent.click(screen.getByRole('tab', { name: /emitir/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Emitir alícuotas del mes' }));

    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('1 alícuotas generadas; 1 ya existían y se omitieron'));
    const inserts = sb.writes('dues', 'insert').map((c) => c.payload as Record<string, unknown>);
    expect(inserts.map((p) => p.user_id).sort()).toEqual(['ana', 'bruno']); // Carla no tiene tipo asignado
    expect(inserts[0]).toMatchObject({ amount: 50, status: 'pending', apartment_type_id: 'tipo-2h' });
    sb.client.from.mockImplementation(originalFrom);
  });
});

describe('Cobranza (cargos extra)', () => {
  beforeEach(() => {
    sb.rows.payments = [
      { id: 'multa-ana', user_id: 'ana', description: 'Multa por ruido', amount: 20, due_date: '2026-12-01', payment_type: 'fine', status: 'pending', receipt_url: 'https://cdn.test/receipts/ana/multa.pdf', paid_at: null, created_at: now.toISOString() },
    ];
  });

  test('UI-C01 aprueba el comprobante de un cargo y avisa al residente', async () => {
    renderPage(<ManagePayments />);
    await screen.findAllByText('Multa por ruido');
    await userEvent.click(screen.getAllByRole('button', { name: 'Aprobar' })[0]);
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Pago aprobado.'));
    expect(sb.writes('payments', 'update')[0].payload).toMatchObject({ status: 'paid', rejection_reason: null });
    expect(notificationTo('ana')).toMatchObject({ title: 'Pago verificado y aprobado', link: '/payments' });
  });

  test('UI-C02 rechaza el comprobante de un cargo', async () => {
    renderPage(<ManagePayments />);
    await screen.findAllByText('Multa por ruido');
    await userEvent.click(screen.getAllByRole('button', { name: 'Rechazar' })[0]);
    await waitFor(() => expect(toasts.warning).toHaveBeenCalled());
    expect(sb.writes('payments', 'update')[0].payload).toMatchObject({ status: 'pending', receipt_url: null });
    expect(notificationTo('ana')).toMatchObject({ type: 'warning' });
  });

  test('UI-C03 no registra un cargo con datos incompletos', async () => {
    renderPage(<ManagePayments />);
    await userEvent.click(await screen.findByRole('button', { name: /registrar cargo/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/descripci|concepto/i), 'Uso de parqueadero');
    await userEvent.click(within(dialog).getByRole('button', { name: /crear cargo/i }));
    // El navegador bloquea el envío: monto y vencimiento son obligatorios
    const monto = within(dialog).getByLabelText(/monto/i) as HTMLInputElement;
    expect(monto).toBeRequired();
    expect(monto.checkValidity()).toBe(false);
    expect(sb.writes('payments', 'insert')).toHaveLength(0);
  });
});
