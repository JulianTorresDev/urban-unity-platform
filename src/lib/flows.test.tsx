/**
 * Flujos con Supabase simulado: subida de comprobantes, marca del conjunto y notificaciones.
 */
import { render, screen, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => {
  const upload = vi.fn();
  const getPublicUrl = vi.fn(() => ({ data: { publicUrl: 'https://cdn.test/receipts/ana/due.pdf' } }));
  const updates: { table: string; payload: Record<string, unknown> }[] = [];
  const updateError = { current: null as null | { code?: string; message: string } };
  const settingsRow = { current: null as null | Record<string, unknown> };
  const insert = vi.fn(async () => ({ error: null }));
  return { upload, getPublicUrl, updates, updateError, settingsRow, insert };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: 'ana' } } } })) },
    storage: { from: () => ({ upload: m.upload, getPublicUrl: m.getPublicUrl }) },
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => ({
        eq: async () => {
          m.updates.push({ table, payload });
          const err = m.updateError.current;
          m.updateError.current = null; // solo el primer intento falla
          return { error: err };
        },
      }),
      select: () => ({ limit: async () => ({ data: m.settingsRow.current ? [m.settingsRow.current] : [], error: null }) }),
      insert: m.insert,
    }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));

import { uploadReceiptResilient, getReceiptUrl } from './receiptStorage';
import { ThemeProvider, useTheme } from './theme';
import { createNotification } from '@/hooks/useNotifications';

const pdf = () => new File(['%PDF-1.4 comprobante'], 'Transferencia.PDF', { type: 'application/pdf' });

beforeEach(() => {
  vi.clearAllMocks();
  m.updates.length = 0;
  m.settingsRow.current = null;
  document.documentElement.removeAttribute('style');
});

describe('Subida de comprobantes', () => {
  test('FLU-C01 sube a la carpeta del residente y deja la alícuota "pendiente de revisión"', async () => {
    m.upload.mockResolvedValue({ error: null });
    const res = await uploadReceiptResilient('due-1', pdf(), 'dues');

    const [path] = m.upload.mock.calls[0];
    expect(path).toMatch(/^ana\/due-due-1-\d+\.pdf$/);
    expect(res).toEqual({ success: true, url: 'https://cdn.test/receipts/ana/due.pdf', usingFallback: false });
    expect(m.updates[0]).toEqual({
      table: 'dues',
      payload: { status: 'pending', receipt_url: 'https://cdn.test/receipts/ana/due.pdf', rejection_reason: null },
    });
    // Nunca intenta marcarla como pagada
    expect(m.updates.every((u) => u.payload.status !== 'paid')).toBe(true);
  });

  test('FLU-C02 si el almacenamiento falla, guarda una copia optimizada y sigue el flujo', async () => {
    m.upload.mockResolvedValue({ error: { message: 'Bucket not found' } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await uploadReceiptResilient('due-2', pdf(), 'dues');
    expect(res.usingFallback).toBe(true);
    expect(res.url).toMatch(/^data:application\/pdf;base64,/);
    expect(getReceiptUrl('due-2')).toBe(res.url);
  });

  test('FLU-C03 en pagos también limpia el motivo del rechazo anterior', async () => {
    m.upload.mockResolvedValue({ error: null });
    await uploadReceiptResilient('pay-1', pdf(), 'payments');
    expect(m.updates[0].table).toBe('payments');
    expect(m.updates[0].payload).toMatchObject({ status: 'pending', rejection_reason: null });
  });

  test('FLU-C05 si la base de datos rechaza el cambio, informa el error y no deja copia local', async () => {
    m.upload.mockResolvedValue({ error: null });
    m.updateError.current = { message: 'Este cobro ya fue verificado y no se puede modificar' };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await uploadReceiptResilient('due-9', pdf(), 'dues');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/ya fue verificado/);
    expect(getReceiptUrl('due-9')).toBeNull();
  });

  test('FLU-C04 con una base sin la columna receipt_url, al menos marca el cobro como pendiente', async () => {
    m.upload.mockResolvedValue({ error: null });
    m.updateError.current = { code: '42703', message: 'column "receipt_url" does not exist' };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await uploadReceiptResilient('due-3', pdf(), 'dues');
    expect(m.updates).toHaveLength(2);
    expect(m.updates[1].payload).toEqual({ status: 'pending' });
  });
});

describe('Marca del conjunto', () => {
  const Probe = () => {
    const { settings } = useTheme();
    return <p>{settings.company_name}</p>;
  };

  test('FLU-T01 aplica el nombre y el color guardados por la administración', async () => {
    m.settingsRow.current = { company_name: 'Conjunto Prueba', primary_color: '#ff0000', secondary_color: '#000000', logo_url: null };
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(await screen.findByText('Conjunto Prueba')).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.style.getPropertyValue('--primary')).toBe('0 100% 50%'));
    expect(document.title).toContain('Conjunto Prueba');
  });

  test('FLU-T02 un color guardado inválido no rompe la interfaz (usa el azul por defecto)', async () => {
    m.settingsRow.current = { company_name: 'Conjunto Prueba', primary_color: 'url(javascript:x)', secondary_color: null, logo_url: null };
    render(<ThemeProvider><Probe /></ThemeProvider>);
    await screen.findByText('Conjunto Prueba');
    await waitFor(() => expect(document.documentElement.style.getPropertyValue('--primary')).toBe('211 100% 45%'));
  });

  test('FLU-T03 sin configuración guardada usa la marca por defecto', async () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(await screen.findByText("Gestor Residencial — Gissel's 2")).toBeInTheDocument();
  });
});

describe('Notificaciones', () => {
  test('FLU-N01 createNotification envía el tipo "info" por defecto y sin enlace', async () => {
    await createNotification({ user_id: 'bruno', title: 'Pago aprobado', message: 'Gracias' });
    expect(m.insert).toHaveBeenCalledWith({ user_id: 'bruno', title: 'Pago aprobado', message: 'Gracias', type: 'info', link: null });
  });
});
