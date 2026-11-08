// @vitest-environment node
/**
 * FUNCIONAL + SEGURIDAD — Control de acceso con QR, pases de visitantes y archivos.
 */
import { createWorld, World } from './fixtures';

let w: World;
beforeAll(async () => { w = await createWorld(); });
afterAll(async () => { await w.db.close(); });

const tokenOf = async (uid: string) =>
  (await w.db.sql<{ token: string; domicile_id: string }>(
    `SELECT token, domicile_id FROM public.access_tokens WHERE user_id = $1 AND type = 'permanent'`, [uid]))[0];

describe('Llave digital QR (F-01)', () => {
  test('FUN-Q01 cada residente nuevo recibe automáticamente su token QR permanente', async () => {
    const id = await w.db.createUser('nueva@gissels2.test', { fullName: 'Nueva Vecina' });
    const t = await tokenOf(id);
    expect(t).toBeDefined();
    expect(t.token).toMatch(/^[0-9a-f]{64}$/);
  });

  test('FUN-Q02 los tokens son únicos', async () => {
    const [a, b] = [await tokenOf(w.ana), await tokenOf(w.bruno)];
    expect(a.token).not.toBe(b.token);
  });

  test('FUN-Q03 la unidad del token sigue a la del perfil cuando la administración la cambia', async () => {
    await w.db.as(w.admin, `UPDATE public.profiles SET apartment_number = '12A' WHERE id = $1`, [w.ana]);
    expect((await tokenOf(w.ana)).domicile_id).toBe('12A');
  });

  test('SEG-Q04 un residente lee su token pero no el de otros', async () => {
    const own = await w.db.as(w.ana, `SELECT token FROM public.access_tokens WHERE user_id = $1`, [w.ana]);
    const other = await w.db.as(w.ana, `SELECT token FROM public.access_tokens WHERE user_id = $1`, [w.bruno]);
    expect(own.rows).toHaveLength(1);
    expect(other.rows).toHaveLength(0);
  });

  test('FUN-Q05 la garita (administración) valida un token y ve si el residente está suspendido', async () => {
    const { token } = await tokenOf(w.blocked);
    // Misma consulta que hace VerifyQR.tsx
    const r = await w.db.as<{ status: string; full_name: string }>(w.admin,
      `SELECT p.status, p.full_name FROM public.access_tokens t JOIN public.profiles p ON p.id = t.user_id WHERE t.token = $1`, [token]);
    expect(r.rows).toEqual([{ status: 'blocked', full_name: 'Carlos Mora' }]);
  });

  test('SEG-Q06 un residente NO puede usar la validación de garita para enumerar tokens', async () => {
    const { token } = await tokenOf(w.bruno);
    const r = await w.db.as(w.ana, `SELECT * FROM public.access_tokens WHERE token = $1`, [token]);
    expect(r.rows).toHaveLength(0);
  });
});

describe('Pases de visitantes y bitácora', () => {
  let codeId: string;
  beforeAll(async () => {
    const r = await w.db.as<{ id: string }>(w.admin,
      `INSERT INTO public.access_codes (user_id, code, type, visitor_name, created_by) VALUES ($1, 'VIS-0001', 'visitor', 'Técnico de internet', $2) RETURNING id`,
      [w.ana, w.admin]);
    codeId = r.rows[0].id;
    await w.db.as(w.admin, `INSERT INTO public.access_logs (access_code_id, direction, scanned_by) VALUES ($1, 'entry', $2)`, [codeId, w.admin]);
  });

  test('FUN-Q07 la administración emite pases y registra entradas', async () => {
    expect(codeId).toBeDefined();
    const logs = await w.db.as(w.admin, `SELECT * FROM public.access_logs WHERE access_code_id = $1`, [codeId]);
    expect(logs.rows).toHaveLength(1);
  });

  test('SEG-Q08 el residente ve sus pases y su bitácora; otro residente no', async () => {
    const ownCodes = await w.db.as(w.ana, `SELECT id FROM public.access_codes`);
    const ownLogs = await w.db.as(w.ana, `SELECT id FROM public.access_logs`);
    const otherCodes = await w.db.as(w.bruno, `SELECT id FROM public.access_codes`);
    const otherLogs = await w.db.as(w.bruno, `SELECT id FROM public.access_logs`);
    expect(ownCodes.rows).toHaveLength(1);
    expect(ownLogs.rows).toHaveLength(1);
    expect(otherCodes.rows).toHaveLength(0);
    expect(otherLogs.rows).toHaveLength(0);
  });

  test('SEG-Q09 un residente NO puede registrar entradas en la bitácora', async () => {
    const r = await w.db.as(w.ana, `INSERT INTO public.access_logs (access_code_id, direction) VALUES ($1, 'exit') RETURNING id`, [codeId]);
    expect(r.ok).toBe(false);
  });
});

describe('Archivos (S-06, S-07)', () => {
  const upload = (uid: string | null, bucket: string, name: string) =>
    w.db.as(uid, `INSERT INTO storage.objects (bucket_id, name) VALUES ($1, $2) RETURNING id`, [bucket, name]);

  test('SEG-A01 un residente sube su comprobante dentro de su carpeta', async () => {
    expect((await upload(w.ana, 'receipts', `${w.ana}/due-1.png`)).ok).toBe(true);
    expect((await upload(w.bruno, 'receipts', `${w.bruno}/due-2.png`)).ok).toBe(true);
  });

  test('SEG-A02 un residente NO puede subir comprobantes en la carpeta de otro ni en la raíz', async () => {
    expect((await upload(w.ana, 'receipts', `${w.bruno}/falso.png`)).ok).toBe(false);
    expect((await upload(w.ana, 'receipts', `suelto.png`)).ok).toBe(false);
  });

  test('SEG-A03 un residente NO puede listar los comprobantes de otros', async () => {
    const r = await w.db.as<{ name: string }>(w.ana, `SELECT name FROM storage.objects WHERE bucket_id = 'receipts'`);
    expect(r.rows.map((x) => x.name)).toEqual([`${w.ana}/due-1.png`]);
  });

  test('SEG-A04 la administración ve todos los comprobantes para verificarlos', async () => {
    const r = await w.db.as(w.admin, `SELECT name FROM storage.objects WHERE bucket_id = 'receipts'`);
    expect(r.rows).toHaveLength(2);
  });

  test('SEG-A05 solo la administración sube logos; cualquiera puede verlos', async () => {
    expect((await upload(w.ana, 'logos', 'logo.png')).ok).toBe(false);
    expect((await upload(w.admin, 'logos', 'logo.png')).ok).toBe(true);
    const anon = await w.db.as(null, `SELECT name FROM storage.objects WHERE bucket_id = 'logos'`);
    expect(anon.rows).toHaveLength(1);
  });

  test('SEG-A06 imágenes del chat: en la carpeta propia y solo con la cuenta activa', async () => {
    expect((await upload(w.ana, 'chat_images', `${w.ana}/foto.jpg`)).ok).toBe(true);
    expect((await upload(w.blocked, 'chat_images', `${w.blocked}/foto.jpg`)).ok).toBe(false);
  });

  test('SEG-A07 los buckets limitan tamaño y tipo de archivo', async () => {
    const rows = await w.db.sql<{ id: string; file_size_limit: number; allowed_mime_types: string[] }>(
      `SELECT id, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id IN ('receipts','chat_images','logos') ORDER BY id`);
    for (const b of rows) {
      expect(b.file_size_limit).toBeGreaterThan(0);
      expect(b.allowed_mime_types.length).toBeGreaterThan(0);
      expect(b.allowed_mime_types).not.toContain('text/html');
    }
  });
});
