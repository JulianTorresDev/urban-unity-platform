// @vitest-environment node
/**
 * SEGURIDAD — Confidencialidad (RNF-01, ISO/IEC 25010).
 * Cada residente solo puede leer su propia información; la administración lee todo;
 * un visitante sin sesión no lee nada salvo la marca del conjunto.
 */
import { createWorld, World } from './fixtures';

let w: World;
beforeAll(async () => { w = await createWorld(); });
afterAll(async () => { await w.db.close(); });

const PRIVATE_TABLES = ['profiles', 'dues', 'payments', 'tickets', 'notifications', 'access_tokens', 'user_roles', 'chat_messages', 'news', 'reservations'];

describe('Visitante sin sesión (rol anon)', () => {
  test.each(PRIVATE_TABLES)('SEG-C01 no puede leer %s', async (table) => {
    const r = await w.db.as(null, `SELECT * FROM public.${table}`);
    expect(r.rows).toHaveLength(0);
  });

  test('SEG-C02 sí puede leer la marca del conjunto (pantalla de acceso)', async () => {
    const r = await w.db.as(null, `SELECT company_name FROM public.system_settings`);
    expect(r.ok).toBe(true);
    expect(r.rows.length).toBeGreaterThan(0);
  });

  test('SEG-C03 no puede escribir en ninguna tabla', async () => {
    const r = await w.db.as(null, `INSERT INTO public.news (title, content) VALUES ('spam', 'spam') RETURNING id`);
    expect(r.ok).toBe(false);
  });
});

describe('Residente', () => {
  test('SEG-C04 solo ve su propio perfil', async () => {
    const r = await w.db.as<{ id: string }>(w.ana, `SELECT id FROM public.profiles`);
    expect(r.rows.map((x) => x.id)).toEqual([w.ana]);
  });

  test.each([
    ['dues', 'user_id'],
    ['payments', 'user_id'],
    ['tickets', 'user_id'],
    ['notifications', 'user_id'],
    ['access_tokens', 'user_id'],
    ['user_roles', 'user_id'],
  ])('SEG-C05 solo ve sus propias filas de %s', async (table, col) => {
    const r = await w.db.as<Record<string, string>>(w.ana, `SELECT ${col} FROM public.${table}`);
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.every((x) => x[col] === w.ana)).toBe(true);
  });

  test('SEG-C06 no puede leer la alícuota de otro residente aunque conozca su id', async () => {
    const r = await w.db.as(w.ana, `SELECT * FROM public.dues WHERE id = $1`, [w.dueBruno]);
    expect(r.rows).toHaveLength(0);
  });

  test('SEG-C07 no puede modificar datos de otro residente', async () => {
    const r = await w.db.as(w.ana, `UPDATE public.profiles SET full_name = 'hackeado' WHERE id = $1 RETURNING id`, [w.bruno]);
    expect(r.rows).toHaveLength(0);
    const [{ full_name }] = await w.db.sql<{ full_name: string }>(`SELECT full_name FROM public.profiles WHERE id = $1`, [w.bruno]);
    expect(full_name).toBe('Bruno Ruiz');
  });

  test.each(['news', 'resources', 'apartment_types', 'reservations', 'chat_messages'])(
    'SEG-C08 puede leer la información comunitaria de %s', async (table) => {
      const r = await w.db.as(w.ana, `SELECT * FROM public.${table}`);
      expect(r.ok).toBe(true);
    }
  );

  test('SEG-C09 ve el nombre y la unidad de otros residentes solo mediante el directorio mínimo', async () => {
    const r = await w.db.as<Record<string, unknown>>(w.ana, `SELECT * FROM public.get_public_profiles($1)`, [[w.bruno]]);
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([{ id: w.bruno, full_name: 'Bruno Ruiz', apartment_number: '34' }]);
    // Sin correo, teléfono, estado ni tarjeta NFC
    expect(Object.keys(r.rows[0]).sort()).toEqual(['apartment_number', 'full_name', 'id']);
  });

  test('SEG-C10 el directorio no está disponible sin sesión', async () => {
    const r = await w.db.as(null, `SELECT * FROM public.get_public_profiles($1)`, [[w.bruno]]);
    expect(r.ok && r.rows.length > 0).toBe(false);
  });
});

describe('Administración', () => {
  test.each(['profiles', 'dues', 'payments', 'tickets', 'user_roles', 'access_tokens'])(
    'SEG-C11 puede leer todas las filas de %s', async (table) => {
      const asAdmin = await w.db.as(w.admin, `SELECT count(*)::int AS n FROM public.${table}`);
      const total = await w.db.sql<{ n: number }>(`SELECT count(*)::int AS n FROM public.${table}`);
      expect((asAdmin.rows[0] as { n: number }).n).toBe(total[0].n);
    }
  );
});
