/**
 * Pruebas unitarias de la lógica pura del frontend.
 */
import { highestRole, isAdminRole, rolesByUser } from './roles';
import { evaluateAccessToken, parseQrPayload } from './accessControl';
import { receiptPath, getReceiptUrl, saveLocalReceipt, clearLocalReceipt } from './receiptStorage';
import { hexToHsl } from './theme';
import { formatUSD } from './format';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

describe('Roles', () => {
  test('UNI-R01 sin filas de rol, la persona es residente', () => {
    expect(highestRole([])).toBe('resident');
  });

  test('UNI-R02 con varias filas gana el rol de mayor jerarquía (antes .single() fallaba)', () => {
    expect(highestRole(['resident', 'admin'])).toBe('admin');
    expect(highestRole(['admin', 'super_admin', 'resident'])).toBe('super_admin');
  });

  test('UNI-R03 ignora valores desconocidos', () => {
    expect(highestRole(['root', null, undefined, 42])).toBe('resident');
  });

  test('UNI-R04 isAdminRole reconoce admin y super_admin', () => {
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('super_admin')).toBe(true);
    expect(isAdminRole('resident')).toBe(false);
    expect(isAdminRole(null)).toBe(false);
  });

  test('UNI-R05 rolesByUser agrupa por usuario sin que la última fila pise a la mayor', () => {
    const map = rolesByUser([
      { user_id: 'a', role: 'admin' },
      { user_id: 'a', role: 'resident' },
      { user_id: 'b', role: 'resident' },
    ]);
    expect(map.get('a')).toBe('admin');
    expect(map.get('b')).toBe('resident');
  });
});

describe('Garita: decisión de acceso', () => {
  const now = new Date('2026-11-07T12:00:00Z');

  test('UNI-Q01 token desconocido: acceso denegado', () => {
    expect(evaluateAccessToken(null, now)).toEqual({ valid: false, reason: 'unknown' });
  });

  test('UNI-Q02 token vencido: acceso denegado (antes se aceptaba)', () => {
    expect(evaluateAccessToken({ expires_at: '2026-11-07T11:59:59Z', profiles: { status: 'active' } }, now))
      .toEqual({ valid: false, reason: 'expired' });
  });

  test('UNI-Q03 residente suspendido: acceso denegado', () => {
    expect(evaluateAccessToken({ expires_at: null, profiles: { status: 'blocked' } }, now))
      .toEqual({ valid: false, reason: 'blocked' });
  });

  test('UNI-Q04 token permanente de residente activo: acceso permitido', () => {
    expect(evaluateAccessToken({ expires_at: null, profiles: { status: 'active' } }, now))
      .toEqual({ valid: true, reason: 'ok' });
  });

  test('UNI-Q05 pase temporal vigente: acceso permitido', () => {
    expect(evaluateAccessToken({ expires_at: '2026-11-08T00:00:00Z', profiles: { status: 'active' } }, now).valid).toBe(true);
  });

  test('UNI-Q06 lee el token del QR en JSON o en texto plano', () => {
    expect(parseQrPayload('{"t":"abc123","u":"x","a":"12"}')).toBe('abc123');
    expect(parseQrPayload('  abc123  ')).toBe('abc123');
    expect(parseQrPayload('{json roto')).toBe('{json roto');
  });

  test('UNI-Q07 recorta contenidos escaneados demasiado largos', () => {
    expect(parseQrPayload('x'.repeat(5000))).toHaveLength(128);
    expect(parseQrPayload(JSON.stringify({ t: 'y'.repeat(500) }))).toHaveLength(128);
  });
});

describe('Comprobantes', () => {
  test('UNI-C01 la ruta queda dentro de la carpeta del usuario (lo exige el bucket)', () => {
    expect(receiptPath('user-1', 'dues', 'due-9', 'captura.PNG', 1000)).toBe('user-1/due-due-9-1000.png');
    expect(receiptPath('user-1', 'payments', 'p-2', 'recibo.pdf', 1000)).toBe('user-1/payment-p-2-1000.pdf');
  });

  test('UNI-C02 no acepta extensiones peligrosas o ausentes', () => {
    expect(receiptPath('u', 'dues', 'd', 'malicioso.html', 1)).toBe('u/due-d-1.png');
    expect(receiptPath('u', 'dues', 'd', 'sin-extension', 1)).toBe('u/due-d-1.png');
    expect(receiptPath('u', 'dues', 'd', '../../etc/passwd', 1)).toBe('u/due-d-1.png');
  });

  test('UNI-C03 prefiere la URL del servidor y usa la copia local como respaldo', () => {
    saveLocalReceipt('due-1', 'data:image/png;base64,AAA');
    expect(getReceiptUrl('due-1', 'https://cdn/x.png')).toBe('https://cdn/x.png');
    expect(getReceiptUrl('due-1', null)).toBe('data:image/png;base64,AAA');
    clearLocalReceipt('due-1');
    expect(getReceiptUrl('due-1', '')).toBeNull();
  });
});

describe('Color de marca', () => {
  test.each([
    ['#000000', '0 0% 0%'],
    ['#ffffff', '0 0% 100%'],
    ['#ff0000', '0 100% 50%'],
    ['#0071e3', '210 100% 45%'],
  ])('UNI-T01 convierte %s a HSL', (hex, hsl) => {
    expect(hexToHsl(hex)).toBe(hsl);
  });

  test.each(['', 'rojo', '#fff', '#12345', 'javascript:alert(1)'])('UNI-T02 un valor inválido (%s) usa el azul por defecto', (bad) => {
    expect(hexToHsl(bad)).toBe('211 100% 45%');
  });
});

describe('Formato de montos', () => {
  test.each([
    [50, '$50.00'],
    [1250.5, '$1,250.50'],
    ['20', '$20.00'],
    [null, '$0.00'],
    ['no-numero', '$0.00'],
  ])('UNI-F01 formatUSD(%s) = %s (mismo formato en toda la app)', (input, out) => {
    expect(formatUSD(input as number)).toBe(out);
  });
});
