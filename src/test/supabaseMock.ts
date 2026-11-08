/**
 * Supabase simulado para pruebas de pantallas.
 *
 * - `sb.rows.<tabla>` define lo que devuelven las lecturas (se aplican los filtros eq/neq/in).
 * - `sb.fail('dues.update', 'mensaje')` hace fallar la siguiente operación de ese tipo.
 * - `sb.writes('dues', 'update')` devuelve lo que la pantalla intentó escribir.
 * - `auth` e identidad: `setUser(...)` configura useAuth y la sesión.
 *
 * Uso en cada archivo de prueba:
 *   vi.mock('@/integrations/supabase/client', async () => ({ supabase: (await import('@/test/supabaseMock')).sb.client }));
 */
import { vi } from 'vitest';

type Row = Record<string, unknown>;
type Op = 'select' | 'insert' | 'update' | 'delete' | 'upsert' | 'rpc' | 'upload';

export interface Call {
  table: string;
  op: Op;
  payload?: unknown;
  filters: [string, unknown[]][];
}

interface Failure {
  message: string;
  code?: string;
}

function matches(row: Row, [method, args]: [string, unknown[]]): boolean {
  const [col, value] = args as [string, unknown];
  if (!(col in row)) return true;
  switch (method) {
    case 'eq': return row[col] === value;
    case 'neq': return row[col] !== value;
    case 'in': return (value as unknown[]).includes(row[col]);
    case 'is': return row[col] === value;
    default: return true;
  }
}

class SupabaseMock {
  rows: Record<string, Row[]> = {};
  calls: Call[] = [];
  rpcResults: Record<string, { data: unknown; error: Failure | null }> = {};
  storageError: Failure | null = null;
  private failures = new Map<string, Failure>();
  session: { user: { id: string; email?: string } } | null = null;

  reset() {
    this.rows = {};
    this.calls = [];
    this.rpcResults = {};
    this.storageError = null;
    this.failures.clear();
    this.session = null;
  }

  /** La próxima operación `tabla.op` (p. ej. "dues.update") falla con este mensaje. */
  fail(key: string, message = 'Error simulado', code?: string) {
    this.failures.set(key, { message, code });
  }

  private takeFailure(key: string): Failure | null {
    const f = this.failures.get(key) ?? null;
    if (f) this.failures.delete(key);
    return f;
  }

  writes(table: string, op?: Op) {
    return this.calls.filter((c) => c.table === table && c.op !== 'select' && (!op || c.op === op));
  }

  reads(table: string) {
    return this.calls.filter((c) => c.table === table && c.op === 'select');
  }

  private builder(table: string) {
    const call: Call = { table, op: 'select', filters: [] };
    let single: 'single' | 'maybe' | null = null;
    let returning = false;
    let registered = false;
    const register = () => {
      if (!registered) {
        this.calls.push(call);
        registered = true;
      }
    };

    const resolve = () => {
      register();
      const error = this.takeFailure(`${table}.${call.op}`);
      if (error) return { data: null, error, count: null };

      let data: unknown;
      if (call.op === 'select') {
        let rows = this.rows[table] ?? [];
        for (const f of call.filters) rows = rows.filter((r) => matches(r, f));
        data = rows;
      } else {
        const payload = call.payload ?? {};
        data = returning ? (Array.isArray(payload) ? payload : [{ id: `nuevo-${this.calls.length}`, created_at: new Date().toISOString(), ...(payload as Row) }]) : null;
      }

      if (single) {
        const list = (data as Row[] | null) ?? [];
        if (single === 'single' && list.length !== 1) {
          return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } };
        }
        return { data: list[0] ?? null, error: null };
      }
      return { data, error: null, count: Array.isArray(data) ? data.length : null };
    };

    const b: Record<string, unknown> = {};
    const chain = (fn: (...args: unknown[]) => void) => (...args: unknown[]) => {
      fn(...args);
      return b;
    };

    Object.assign(b, {
      select: chain((cols) => {
        if (call.op === 'select') call.payload = cols;
        else returning = true;
      }),
      insert: chain((p) => { call.op = 'insert'; call.payload = p; register(); }),
      update: chain((p) => { call.op = 'update'; call.payload = p; register(); }),
      upsert: chain((p) => { call.op = 'upsert'; call.payload = p; register(); }),
      delete: chain(() => { call.op = 'delete'; register(); }),
      single: chain(() => { single = 'single'; }),
      maybeSingle: chain(() => { single = 'maybe'; }),
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve().then(resolve).then(onFulfilled, onRejected),
    });
    for (const m of ['eq', 'neq', 'in', 'is', 'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range', 'match', 'or', 'not', 'filter', 'ilike', 'like', 'contains']) {
      b[m] = chain((...args) => { call.filters.push([m, args]); });
    }
    return b;
  }

  private channel = () => {
    const ch: Record<string, unknown> = {};
    ch.on = () => ch;
    ch.subscribe = () => ch;
    ch.unsubscribe = vi.fn();
    return ch;
  };

  client = {
    from: vi.fn((table: string) => this.builder(table)),
    rpc: vi.fn(async (fn: string, args?: unknown) => {
      this.calls.push({ table: `rpc:${fn}`, op: 'rpc', payload: args, filters: [] });
      const failure = this.takeFailure(`rpc:${fn}`);
      if (failure) return { data: null, error: failure };
      return this.rpcResults[fn] ?? { data: null, error: null };
    }),
    auth: {
      getSession: vi.fn(async () => ({ data: { session: this.session } })),
      getUser: vi.fn(async () => ({ data: { user: this.session?.user ?? null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: vi.fn(async () => ({ error: null })),
      signInWithPassword: vi.fn(async () => ({ error: null })),
      signUp: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
    storage: {
      from: (bucket: string) => ({
        upload: vi.fn(async (path: string) => {
          this.calls.push({ table: `storage:${bucket}`, op: 'upload', payload: { path }, filters: [] });
          return { data: this.storageError ? null : { path }, error: this.storageError };
        }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${path}` } }),
        remove: vi.fn(async () => ({ error: null })),
      }),
    },
    channel: vi.fn(() => this.channel()),
    removeChannel: vi.fn(),
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  };
}

export const sb = new SupabaseMock();

// ---------- Identidad simulada para useAuth ----------
export type TestRole = 'resident' | 'admin' | 'super_admin';

export const auth = {
  user: null as null | { id: string; email: string },
  role: 'resident' as TestRole,
  loading: false,
  signIn: vi.fn(async () => ({ error: null })),
  signOut: vi.fn(async () => {}),
  signUp: vi.fn(async () => ({ error: null })),
  get isAdmin() { return this.role === 'admin' || this.role === 'super_admin'; },
  get isSuperAdmin() { return this.role === 'super_admin'; },
  get session() { return this.user ? { user: this.user } : null; },
};

export function setUser(id: string, role: TestRole = 'resident', email = `${id}@gissels2.test`) {
  auth.user = { id, email };
  auth.role = role;
  sb.session = { user: { id, email } };
}

// ---------- Avisos (sonner) ----------
export const toasts = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

export const lastToast = () => {
  const all = (Object.entries(toasts) as [string, ReturnType<typeof vi.fn>][])
    .flatMap(([kind, fn]) => fn.mock.calls.map((args, i) => ({ kind, text: String(args[0]), order: fn.mock.invocationCallOrder[i] })));
  return all.sort((a, b) => b.order - a.order)[0];
};

export function resetAll() {
  sb.reset();
  auth.user = null;
  auth.role = 'resident';
  Object.values(toasts).forEach((fn) => fn.mockClear());
  auth.signOut.mockClear();
  theme.updateSettings.mockReset();
  theme.previewTheme.mockClear();
}

// ---------- Marca del conjunto (useTheme) ----------
export const theme = {
  settings: { company_name: "Gissel's 2", logo_url: null as string | null, primary_color: '#0071e3', secondary_color: '#1e293b' },
  loading: false,
  updateSettings: vi.fn(async () => {}),
  previewTheme: vi.fn(),
  refreshSettings: vi.fn(async () => {}),
};
