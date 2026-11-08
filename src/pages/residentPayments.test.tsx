/**
 * HU-05 a HU-09 — Residente: alícuotas, cargos extra y comprobantes (pantallas reales).
 */
import '@/test/pageSetup';
import { renderPage } from '@/test/pageSetup';
import { sb, setUser, resetAll, toasts } from '@/test/supabaseMock';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dues from './Dues';
import Payments from './Payments';

const now = new Date();
const thisMonth = now.getMonth() + 1;
const thisYear = now.getFullYear();

const pdf = (size = 2048) => {
  const f = new File(['%PDF-1.4'], 'transferencia.pdf', { type: 'application/pdf' });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

beforeEach(() => {
  resetAll();
  setUser('ana');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Alícuotas (Dues)', () => {
  beforeEach(() => {
    sb.rows.dues = [
      { id: 'due-actual', user_id: 'ana', amount: 50, month: thisMonth, year: thisYear, status: 'pending', receipt_url: null, rejection_reason: null, created_at: now.toISOString() },
      { id: 'due-pagada', user_id: 'ana', amount: 50, month: 1, year: thisYear - 1, status: 'paid', receipt_url: 'https://cdn.test/x.pdf', rejection_reason: null, created_at: now.toISOString() },
    ];
  });

  test('UI-D01 muestra el resumen de su cuenta (solo sus alícuotas)', async () => {
    renderPage(<Dues />);
    expect(await screen.findAllByText('$100.00')).not.toHaveLength(0);
    expect(screen.getAllByText('$50.00').length).toBeGreaterThan(0);
    const read = sb.reads('dues')[0];
    expect(read.filters).toContainEqual(['eq', ['user_id', 'ana']]);
  });

  test('UI-D02 subir comprobante: envía el archivo a su carpeta y queda en revisión', async () => {
    renderPage(<Dues />);
    const [button] = await screen.findAllByRole('button', { name: /subir foto de comprobante/i });
    await userEvent.click(button);
    fireEvent.change(fileInput(), { target: { files: [pdf()] } });

    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Comprobante enviado. La administración lo revisará pronto.'));
    const upload = sb.calls.find((c) => c.table === 'storage:receipts');
    expect((upload?.payload as { path: string }).path).toMatch(/^ana\/due-due-actual-\d+\.pdf$/);
    expect(sb.writes('dues', 'update')[0].payload).toEqual({
      status: 'pending',
      receipt_url: expect.stringContaining('https://cdn.test/receipts/ana/'),
      rejection_reason: null,
    });
  });

  test('UI-D03 rechaza archivos que no son foto ni PDF', async () => {
    renderPage(<Dues />);
    const [button] = await screen.findAllByRole('button', { name: /subir foto de comprobante/i });
    await userEvent.click(button);
    fireEvent.change(fileInput(), { target: { files: [new File(['x'], 'virus.exe', { type: 'application/x-msdownload' })] } });
    expect(toasts.error).toHaveBeenCalledWith('Por favor selecciona una foto (JPG, PNG) o un archivo PDF');
    expect(sb.writes('dues')).toHaveLength(0);
  });

  test('UI-D04 rechaza archivos de más de 5 MB', async () => {
    renderPage(<Dues />);
    const [button] = await screen.findAllByRole('button', { name: /subir foto de comprobante/i });
    await userEvent.click(button);
    fireEvent.change(fileInput(), { target: { files: [pdf(6 * 1024 * 1024)] } });
    expect(toasts.error).toHaveBeenCalledWith('La imagen no debe pesar más de 5 MB');
  });

  test('UI-D05 si la base de datos rechaza el cambio, avisa el error (antes decía "enviado")', async () => {
    sb.fail('dues.update', 'Este cobro ya fue verificado y no se puede modificar');
    renderPage(<Dues />);
    const [button] = await screen.findAllByRole('button', { name: /subir foto de comprobante/i });
    await userEvent.click(button);
    fireEvent.change(fileInput(), { target: { files: [pdf()] } });
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith(expect.stringContaining('ya fue verificado')));
    expect(toasts.success).not.toHaveBeenCalled();
  });

  test('UI-D06 muestra el motivo del rechazo anterior para que corrija el comprobante', async () => {
    sb.rows.dues[0].rejection_reason = 'La imagen está borrosa';
    renderPage(<Dues />);
    expect(await screen.findByText(/La imagen está borrosa/)).toBeInTheDocument();
  });

  test('UI-D07 copia el número de cuenta para transferir', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage(<Dues />);
    await userEvent.click(await screen.findByRole('button', { name: 'Copiar número de cuenta' }));
    expect(writeText).toHaveBeenCalledWith('2100874523');
  });
});

describe('Cargos extra (Payments)', () => {
  beforeEach(() => {
    sb.rows.payments = [
      { id: 'multa-1', user_id: 'ana', description: 'Multa por ruido', amount: 20, due_date: '2026-12-01', payment_type: 'fine', status: 'pending', receipt_url: null, rejection_reason: null, paid_at: null, created_at: now.toISOString() },
    ];
  });

  test('UI-P01 muestra sus cargos pendientes', async () => {
    renderPage(<Payments />);
    expect(await screen.findByText('Multa por ruido')).toBeInTheDocument();
    expect(sb.reads('payments')[0].filters).toContainEqual(['eq', ['user_id', 'ana']]);
  });

  test('UI-P02 sube el comprobante de un cargo y lo deja en revisión', async () => {
    renderPage(<Payments />);
    await screen.findByText('Multa por ruido');
    const button = screen.getAllByRole('button').find((b) => /subir|comprobante/i.test(b.textContent ?? ''))!;
    await userEvent.click(button);
    fireEvent.change(fileInput(), { target: { files: [pdf()] } });
    await waitFor(() => expect(toasts.success).toHaveBeenCalled());
    const update = sb.writes('payments', 'update')[0];
    expect(update.payload).toMatchObject({ status: 'pending', rejection_reason: null });
    expect(update.filters).toContainEqual(['eq', ['id', 'multa-1']]);
  });

  test('UI-P03 avisa si el registro del comprobante falla', async () => {
    sb.fail('payments.update', 'permission denied');
    renderPage(<Payments />);
    await screen.findByText('Multa por ruido');
    const button = screen.getAllByRole('button').find((b) => /subir|comprobante/i.test(b.textContent ?? ''))!;
    await userEvent.click(button);
    fireEvent.change(fileInput(), { target: { files: [pdf()] } });
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith(expect.stringContaining('permission denied')));
  });
});
