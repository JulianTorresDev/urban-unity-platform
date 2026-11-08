// @vitest-environment node
/**
 * SEGURIDAD — Revisión estructural del esquema (equivalente al "Security Advisor" de Supabase).
 */
import { createTestDb, TestDb, useHardening } from './harness';

let db: TestDb;
beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => { await db.close(); });

test('SEG-E01 todas las tablas públicas tienen RLS activado', async () => {
  const rows = await db.sql<{ tablename: string }>(
    `SELECT c.relname AS tablename FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`);
  expect(rows.map((r) => r.tablename)).toEqual([]);
});

test('SEG-E02 ninguna tabla con RLS queda sin políticas (inaccesible o mal configurada)', async () => {
  const rows = await db.sql<{ tablename: string }>(
    `SELECT c.relname AS tablename FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
       AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname)`);
  expect(rows.map((r) => r.tablename)).toEqual([]);
});

test('SEG-E03 ninguna política de escritura está abierta a anon o a public', async () => {
  const rows = await db.sql<{ tablename: string; policyname: string }>(
    `SELECT tablename, policyname FROM pg_policies
     WHERE schemaname IN ('public', 'storage') AND cmd <> 'SELECT'
       AND (roles && ARRAY['anon','public']::name[])`);
  expect(rows).toEqual([]);
});

test('SEG-E04 las políticas de UPDATE de usuarios finales tienen WITH CHECK', async () => {
  const rows = await db.sql<{ tablename: string; policyname: string }>(
    `SELECT tablename, policyname FROM pg_policies
     WHERE schemaname = 'public' AND cmd IN ('UPDATE', 'ALL') AND with_check IS NULL`);
  expect(rows).toEqual([]);
});

test('SEG-E05 las funciones SECURITY DEFINER fijan search_path (evita secuestro de funciones)', async () => {
  const rows = await db.sql<{ proname: string }>(
    `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
       AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) cfg WHERE cfg LIKE 'search_path=%')`);
  expect(rows.map((r) => r.proname)).toEqual([]);
});

test('SEG-E06 las funciones sensibles no son ejecutables por anon', async () => {
  for (const fn of ['set_user_role(uuid, app_role)', 'get_public_profiles(uuid[])']) {
    const [{ allowed }] = await db.sql<{ allowed: boolean }>(
      `SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE') AS allowed`);
    expect(allowed, fn).toBe(false);
  }
});

// Sobre el esquema antiguo no aplica: los datos iniciales nuevos sí agregan filas
test.skipIf(!useHardening)('SEG-E07 la migración y los datos iniciales son idempotentes (se pueden volver a ejecutar)', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
  const count = async () => (await db.sql<{ n: number }>(`SELECT (SELECT count(*) FROM public.resources) + (SELECT count(*) FROM public.apartment_types) AS n`))[0].n;
  const before = await count();
  await expect(db.pg.exec(read('supabase/migrations/20261107120000_esquema_inicial.sql'))).resolves.toBeDefined();
  await expect(db.pg.exec(read('supabase/seed.sql'))).resolves.toBeDefined();
  expect(await count()).toBe(before);
});

test('SEG-E08 la migración de endurecimiento sigue sirviendo para actualizar una base antigua', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const sql = readFileSync(resolve(__dirname, '../../supabase/migrations_legacy/20261107000000_security_hardening.sql'), 'utf8');
  await expect(db.pg.exec(sql)).resolves.toBeDefined();
});
