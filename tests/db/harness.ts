import { PGlite, type Transaction } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

/** Única migración del proyecto y sus datos iniciales: lo mismo que se aplica en Supabase. */
export const SCHEMA_MIGRATION = 'supabase/migrations/20261107120000_esquema_inicial.sql';
export const SEED = 'supabase/seed.sql';

/**
 * Esquema anterior, sin las correcciones de seguridad (archivado en migrations_legacy).
 * Las migraciones más antiguas no se pueden reproducir en orden porque crean las
 * mismas tablas sin IF NOT EXISTS (ver informe, F-05).
 */
export const BASELINE_MIGRATIONS = [
  'supabase/migrations_legacy/20261011_master_database_update.sql',
  'supabase/migrations_legacy/20261011_receipts_and_branding_update.sql',
];

/** Con DB_BASELINE=1 las pruebas corren contra el esquema sin endurecer, para medir el "antes". */
export const useHardening = process.env.DB_BASELINE !== '1';

export type Role = 'resident' | 'admin' | 'super_admin';

export interface UserOptions {
  fullName?: string;
  role?: Role;
  apartment?: string;
  status?: 'active' | 'blocked';
  phone?: string;
}

export interface Attempt<T = Record<string, unknown>> {
  ok: boolean;
  rows: T[];
  affected: number;
  error?: string;
}

export class TestDb {
  constructor(public readonly pg: PGlite) {}

  /** Consulta como superusuario (equivale al SQL editor o service_role). */
  async sql<T = Record<string, unknown>>(query: string, params: unknown[] = []) {
    const res = await this.pg.query<T>(query, params);
    return res.rows;
  }

  /** Alta de usuario por el mismo camino que Supabase Auth: INSERT en auth.users dispara handle_new_user. */
  async createUser(email: string, opts: UserOptions = {}): Promise<string> {
    const [{ id }] = await this.sql<{ id: string }>(
      `INSERT INTO auth.users (email, raw_user_meta_data, email_confirmed_at)
       VALUES ($1, $2, now()) RETURNING id`,
      [email, JSON.stringify({ full_name: opts.fullName ?? email.split('@')[0], phone: opts.phone ?? null })]
    );
    if (opts.role && opts.role !== 'resident') {
      await this.sql(`DELETE FROM public.user_roles WHERE user_id = $1`, [id]);
      await this.sql(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, $2)`, [id, opts.role]);
    }
    if (opts.apartment || opts.status) {
      await this.sql(
        `UPDATE public.profiles SET apartment_number = COALESCE($2, apartment_number), status = COALESCE($3, status) WHERE id = $1`,
        [id, opts.apartment ?? null, opts.status ?? null]
      );
    }
    return id;
  }

  /**
   * Ejecuta una consulta con la identidad de un usuario, igual que PostgREST:
   * rol `authenticated` (o `anon` si uid es null) y el "sub" del JWT.
   * Nunca lanza: devuelve si se permitió, las filas y el error de Postgres.
   */
  async as<T = Record<string, unknown>>(uid: string | null, query: string, params: unknown[] = []): Promise<Attempt<T>> {
    try {
      const res = await this.pg.transaction(async (tx: Transaction) => {
        await tx.exec(`SET LOCAL ROLE ${uid ? 'authenticated' : 'anon'}`);
        await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
        return tx.query<T>(query, params);
      });
      return { ok: true, rows: res.rows, affected: res.affectedRows ?? res.rows.length };
    } catch (e) {
      return { ok: false, rows: [], affected: 0, error: (e as Error).message };
    }
  }

  async close() {
    await this.pg.close();
  }
}

let stubs: string | undefined;

export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  stubs ??= read('tests/db/supabase-stubs.sql');
  await pg.exec(stubs);
  const migrations = useHardening ? [SCHEMA_MIGRATION, SEED] : BASELINE_MIGRATIONS;
  for (const file of migrations) {
    await pg.exec(read(file));
  }
  return new TestDb(pg);
}

/** Fecha futura a una hora local de Ecuador (UTC-5), p. ej. at(3, 10) = dentro de 3 días a las 10:00. */
export function at(daysAhead: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(hour + 5, minute, 0, 0);
  return d.toISOString();
}
