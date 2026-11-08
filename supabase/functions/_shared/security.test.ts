// @vitest-environment node
/**
 * Seguridad de las Edge Functions send-notification y create-resident.
 */
import { authorizeRequest, bearerToken, escapeHtml, isValidEmail, validateNewResident } from './security';

describe('Escape de HTML en correos', () => {
  test('EDGE-01 neutraliza etiquetas y atributos inyectados', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(escapeHtml(`"><a href='http://phishing'>Pagar</a>`)).toBe('&quot;&gt;&lt;a href=&#39;http://phishing&#39;&gt;Pagar&lt;/a&gt;');
  });

  test('EDGE-02 deja intactos los textos normales con tildes', () => {
    expect(escapeHtml('Fuga en el baño — bloque B')).toBe('Fuga en el baño — bloque B');
  });

  test('EDGE-03 convierte null y undefined en cadena vacía', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(50)).toBe('50');
  });
});

describe('Validación de destinatario', () => {
  test.each(['ana@correo.com', 'julian.torres+casa12@udla.edu.ec'])('EDGE-04 acepta %s', (e) => {
    expect(isValidEmail(e)).toBe(true);
  });

  test.each(['', 'sin-arroba', 'a@b', 'ana@correo.com>', '"x"@y.com', 'a b@c.com', `${'a'.repeat(250)}@x.com`])(
    'EDGE-05 rechaza %s', (e) => {
      expect(isValidEmail(e)).toBe(false);
    }
  );
});

describe('Autorización', () => {
  const deps = (userId: string | null, admin: boolean) => ({
    getUserId: vi.fn(async () => userId),
    isAdmin: vi.fn(async () => admin),
  });

  test('EDGE-06 extrae el token Bearer', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(bearerToken('bearer   xyz')).toBe('xyz');
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });

  test('EDGE-07 sin token: 401', async () => {
    expect(await authorizeRequest(null, deps('u', true))).toMatchObject({ ok: false, status: 401 });
  });

  test('EDGE-08 token inválido o solo la clave anónima: 401', async () => {
    expect(await authorizeRequest('Bearer anon-key', deps(null, false))).toMatchObject({ ok: false, status: 401 });
  });

  test('EDGE-09 residente autenticado: 403', async () => {
    expect(await authorizeRequest('Bearer jwt', deps('ana', false))).toMatchObject({ ok: false, status: 403 });
  });

  test('EDGE-10 administrador: autorizado', async () => {
    expect(await authorizeRequest('Bearer jwt', deps('admin', true))).toEqual({ ok: true, userId: 'admin' });
  });
});

describe('Alta de residentes (create-resident)', () => {
  const deps = (userId: string | null, admin: boolean) => ({ getUserId: async () => userId, isAdmin: async () => admin });

  test('EDGE-11 un residente no puede registrar cuentas: 403 con un motivo propio', async () => {
    expect(await authorizeRequest('Bearer jwt', deps('ana', false), true, 'Solo la administración puede registrar residentes'))
      .toEqual({ ok: false, status: 403, error: 'Solo la administración puede registrar residentes' });
  });

  test('EDGE-12 normaliza correo, nombre y campos opcionales', () => {
    expect(validateNewResident({ fullName: '  Ana Pérez ', email: ' Ana@Correo.COM ', password: 'Segura2026!', apartment: ' 12-A ', phone: '', nfc: undefined }))
      .toEqual({ ok: true, value: { fullName: 'Ana Pérez', email: 'ana@correo.com', password: 'Segura2026!', apartment: '12-A', phone: null, nfc: null } });
  });

  test.each([
    [{ email: 'a@b.com', password: 'Segura2026!' }, /obligatorios/],
    [{ fullName: 'Ana', email: 'no-es-correo', password: 'Segura2026!' }, /correo no es válido/],
    [{ fullName: 'Ana', email: 'a@correo.com', password: '1234567' }, /8 caracteres/],
    [{ fullName: 'Ana', email: 'a@correo.com', password: 'x'.repeat(73) }, /72 caracteres/],
    [{ fullName: 'Ana', email: 'a@correo.com', password: 12345678 }, /obligatorios/],
  ])('EDGE-13 rechaza datos inválidos %#', (input, msg) => {
    const res = validateNewResident(input as Record<string, unknown>);
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(msg);
  });
});
