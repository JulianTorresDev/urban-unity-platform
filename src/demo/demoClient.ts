/**
 * Supabase simulado para la versión demo (npm run build:demo).
 *
 * Implementa el subconjunto de supabase-js que usa la app: consultas con filtros,
 * relaciones simples (`*, resources(name)`), inserciones, cambios, borrados,
 * funciones (rpc), sesión, archivos y tiempo real. Los datos viven en el navegador
 * (localStorage) y se pueden restablecer. Replica las reglas de negocio de la base
 * real que la interfaz necesita para comportarse igual: llave QR automática,
 * reservas sin cruces y con precio calculado, y comprobantes que solo aprueba la
 * administración.
 */
import { createSeed, DEMO_PASSWORD, type DemoDb } from './demoSeed';

type Row = Record<string, unknown>;
type DbError = { message: string; code?: string };
type Result = { data: unknown; error: DbError | null; count?: number | null };

const DB_KEY = 'gissels2-demo-db-v2';
const SESSION_KEY = 'gissels2-demo-session-v1';

// ---------- Persistencia ----------
function loadDb(): DemoDb {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as DemoDb;
  } catch { /* sin almacenamiento: se usa la semilla */ }
  return createSeed();
}

let db: DemoDb = loadDb();
const files = new Map<string, string>(); // "bucket/ruta" -> data URL (solo en memoria)

function save() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch { /* cuota llena o bloqueado */ }
}

export function resetDemoData() {
  db = createSeed();
  files.clear();
  save();
}

const table = (name: string): Row[] => (db.tables[name] ??= []);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const now = () => new Date().toISOString();

// ---------- Sesión ----------
interface DemoUser { id: string; email: string; user_metadata: Record<string, unknown>; identities: unknown[]; aud: string; created_at: string }
interface DemoSession { access_token: string; token_type: string; user: DemoUser; expires_at: number }

function toUser(u: Row): DemoUser {
  return { id: u.id as string, email: u.email as string, user_metadata: { full_name: u.full_name }, identities: [{ provider: 'email' }], aud: 'authenticated', created_at: u.created_at as string };
}

let session: DemoSession | null = (() => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as DemoSession) : null;
  } catch { return null; }
})();

type AuthListener = (event: string, s: DemoSession | null) => void;
const authListeners = new Set<AuthListener>();

function setSession(next: DemoSession | null, event: string) {
  session = next;
  try {
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* sin almacenamiento */ }
  authListeners.forEach((cb) => cb(event, next));
}

const currentUid = () => session?.user.id ?? null;
const roleOf = (uid: string | null) => (uid ? (table('user_roles').find((r) => r.user_id === uid)?.role as string | undefined) : undefined);
const isAdmin = (uid: string | null) => ['admin', 'super_admin'].includes(roleOf(uid) ?? '');

// ---------- Tiempo real ----------
interface Subscription { table: string; event: string; filter?: string; cb: (payload: Row) => void }
const subscriptions = new Set<Subscription>();

function emit(tableName: string, eventType: 'INSERT' | 'UPDATE' | 'DELETE', next: Row | null, old: Row | null) {
  for (const s of subscriptions) {
    if (s.table !== tableName) continue;
    if (s.event !== '*' && s.event !== eventType) continue;
    if (s.filter) {
      const [col, rest] = s.filter.split('=');
      const value = rest?.replace(/^eq\./, '');
      const row = next ?? old ?? {};
      if (String(row[col]) !== value) continue;
    }
    setTimeout(() => s.cb({ eventType, new: next ?? {}, old: old ?? {}, table: tableName, schema: 'public' }), 0);
  }
}

// ---------- Reglas de negocio de la base real ----------
function issuePermanentToken(profile: Row) {
  const exists = table('access_tokens').some((t) => t.user_id === profile.id && t.type === 'permanent');
  if (exists) return;
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 64);
  table('access_tokens').push({ id: uuid(), user_id: profile.id, domicile_id: profile.apartment_number || 'S/N', token, type: 'permanent', expires_at: null, created_at: now() });
}

function createAuthUser(email: string, password: string, meta: Record<string, unknown>): Row | DbError {
  const normalized = email.trim().toLowerCase();
  if (table('auth_users').some((u) => u.email === normalized)) return { message: 'User already registered' };
  if (password.length < 8) return { message: 'Password should be at least 8 characters.' };
  const user = { id: uuid(), email: normalized, password, full_name: meta.full_name ?? 'Residente', created_at: now() };
  table('auth_users').push(user);
  // handle_new_user: perfil, rol de residente y llave QR
  const profile = { id: user.id, email: normalized, full_name: meta.full_name ?? 'Residente', phone: meta.phone ?? null, apartment_number: null, apartment_type_id: null, status: 'active', nfc_card_id: null, created_at: now(), updated_at: now() };
  table('profiles').push(profile);
  table('user_roles').push({ id: uuid(), user_id: user.id, role: 'resident', created_at: now() });
  issuePermanentToken(profile);
  save();
  return user;
}

const DEFAULTS: Record<string, Row> = {
  dues: { status: 'pending', receipt_url: null, rejection_reason: null, paid_at: null, notes: null },
  payments: { status: 'pending', receipt_url: null, rejection_reason: null, paid_at: null },
  reservations: { status: 'pending', notes: null, rejection_reason: null, price: 0 },
  tickets: { status: 'open', admin_notes: null },
  notifications: { is_read: false, type: 'info', link: null },
  access_codes: { is_active: true, notes: null },
  news: { image_url: null },
  chat_messages: { image_url: null },
};

function beforeInsert(name: string, row: Row): DbError | null {
  const uid = currentUid();
  if (name === 'reservations') {
    const start = new Date(row.start_time as string).getTime();
    const end = new Date(row.end_time as string).getTime();
    if (!(end > start)) return { message: 'La hora de fin debe ser posterior a la de inicio', code: '22007' };
    if (!isAdmin(uid)) {
      const res = table('resources').find((r) => r.id === row.resource_id);
      if (!res) return { message: 'El área solicitada no existe', code: '23503' };
      if (start <= Date.now()) return { message: 'No puedes reservar en un horario pasado', code: '22007' };
      const hours = (end - start) / 3_600_000;
      if (res.max_hours_per_booking && hours > Number(res.max_hours_per_booking)) {
        return { message: `La reserva supera el máximo de ${res.max_hours_per_booking} horas para esta área`, code: '22023' };
      }
      row.status = 'pending';
      row.rejection_reason = null;
      row.price = Number(res.base_price ?? 0) + Number(res.price_per_hour ?? 0) * hours;
    }
    if (['pending', 'confirmed'].includes(row.status as string)) {
      const clash = table('reservations').some((r) => r.resource_id === row.resource_id && r.id !== row.id
        && ['pending', 'confirmed'].includes(r.status as string)
        && new Date(r.start_time as string).getTime() < end && new Date(r.end_time as string).getTime() > start);
      if (clash) return { message: 'Este espacio ya se encuentra reservado en ese horario', code: '23P01' };
    }
  }
  if (name === 'chat_messages' && typeof row.content === 'string' && row.content.length > 2000) {
    return { message: 'El mensaje no puede superar los 2000 caracteres', code: '23514' };
  }
  return null;
}

function beforeUpdate(name: string, old: Row, patch: Row): DbError | null {
  const uid = currentUid();
  if (isAdmin(uid)) return null;
  if ((name === 'dues' || name === 'payments') && patch.status && patch.status !== 'pending') {
    return { message: 'Solo la administración puede aprobar un pago', code: '42501' };
  }
  if ((name === 'dues' || name === 'payments') && old.status === 'paid') {
    return { message: 'Este cobro ya fue verificado y no se puede modificar', code: '42501' };
  }
  if (name === 'profiles') {
    const allowed = ['full_name', 'phone', 'updated_at'];
    if (Object.keys(patch).some((k) => !allowed.includes(k) && patch[k] !== old[k])) {
      return { message: 'Solo la administración puede modificar el estado, la unidad o el correo de un perfil', code: '42501' };
    }
  }
  return null;
}

// ---------- Consultas ----------
function splitTopLevel(cols: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const ch of cols) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function foreignKeyFor(base: Row, rel: string): string | undefined {
  const singular = rel.replace(/s$/, '');
  const candidates = [`${singular}_id`, 'user_id', 'sender_id', 'author_id'];
  return candidates.find((c) => c in base);
}

function project(row: Row, cols: string | undefined): Row {
  if (!cols || cols.trim() === '*') return { ...row };
  const out: Row = {};
  for (const part of splitTopLevel(cols)) {
    const m = part.match(/^(?:(\w+):)?(\w+)(?:!\w+)?\((.*)\)$/);
    if (m) {
      const [, alias, rel, inner] = m;
      const fk = foreignKeyFor(row, rel);
      const target = fk ? table(rel).find((r) => r.id === row[fk]) : undefined;
      out[alias ?? rel] = target ? project(target, inner) : null;
    } else if (part === '*') {
      Object.assign(out, row);
    } else {
      out[part] = row[part];
    }
  }
  return out;
}

function compare(a: unknown, b: unknown) {
  if (typeof a === 'number' || typeof b === 'number') return Number(a) - Number(b);
  return String(a ?? '').localeCompare(String(b ?? ''));
}

type Filter = (r: Row) => boolean;
function opFilter(col: string, op: string, value: unknown): Filter {
  switch (op) {
    case 'eq': return (r) => r[col] === value || (r[col] != null && String(r[col]) === String(value));
    case 'neq': return (r) => String(r[col]) !== String(value);
    case 'gt': return (r) => r[col] != null && compare(r[col], value) > 0;
    case 'gte': return (r) => r[col] != null && compare(r[col], value) >= 0;
    case 'lt': return (r) => r[col] != null && compare(r[col], value) < 0;
    case 'lte': return (r) => r[col] != null && compare(r[col], value) <= 0;
    case 'is': return (r) => (value === null || value === 'null' ? r[col] == null : r[col] === value);
    case 'in': {
      const list = Array.isArray(value) ? value : String(value).replace(/^\(|\)$/g, '').split(',');
      return (r) => list.map(String).includes(String(r[col]));
    }
    case 'like':
    case 'ilike': {
      const re = new RegExp('^' + String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', op === 'ilike' ? 'i' : '');
      return (r) => re.test(String(r[col] ?? ''));
    }
    default: return () => true;
  }
}

function parseOr(expr: string): Filter {
  const parts = expr.split(',').map((p) => {
    const [col, op, ...rest] = p.split('.');
    return opFilter(col, op, rest.join('.'));
  });
  return (r) => parts.some((f) => f(r));
}

class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private cols?: string;
  private returning?: string;
  private payload: unknown;
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private lim?: number;
  private from?: number;
  private to?: number;
  private singleMode: 'single' | 'maybe' | null = null;
  private countOnly = false;
  private wantCount = false;

  constructor(private name: string) {}

  select(cols = '*', opts?: { count?: string; head?: boolean }) {
    if (this.op === 'select') {
      this.cols = cols;
      this.wantCount = !!opts?.count;
      this.countOnly = !!opts?.head;
    } else {
      this.returning = cols;
    }
    return this;
  }
  insert(p: unknown) { this.op = 'insert'; this.payload = p; return this; }
  update(p: unknown) { this.op = 'update'; this.payload = p; return this; }
  upsert(p: unknown) { this.op = 'upsert'; this.payload = p; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c: string, v: unknown) { this.filters.push(opFilter(c, 'eq', v)); return this; }
  neq(c: string, v: unknown) { this.filters.push(opFilter(c, 'neq', v)); return this; }
  gt(c: string, v: unknown) { this.filters.push(opFilter(c, 'gt', v)); return this; }
  gte(c: string, v: unknown) { this.filters.push(opFilter(c, 'gte', v)); return this; }
  lt(c: string, v: unknown) { this.filters.push(opFilter(c, 'lt', v)); return this; }
  lte(c: string, v: unknown) { this.filters.push(opFilter(c, 'lte', v)); return this; }
  is(c: string, v: unknown) { this.filters.push(opFilter(c, 'is', v)); return this; }
  in(c: string, v: unknown[]) { this.filters.push(opFilter(c, 'in', v)); return this; }
  like(c: string, v: string) { this.filters.push(opFilter(c, 'like', v)); return this; }
  ilike(c: string, v: string) { this.filters.push(opFilter(c, 'ilike', v)); return this; }
  match(obj: Row) { for (const [k, v] of Object.entries(obj)) this.eq(k, v); return this; }
  filter(c: string, op: string, v: unknown) { this.filters.push(opFilter(c, op, v)); return this; }
  not(c: string, op: string, v: unknown) { const f = opFilter(c, op, v); this.filters.push((r) => !f(r)); return this; }
  or(expr: string) { this.filters.push(parseOr(expr)); return this; }
  contains() { return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.orders.push({ col, asc: opts?.ascending ?? true }); return this; }
  limit(n: number) { this.lim = n; return this; }
  range(a: number, b: number) { this.from = a; this.to = b; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }
  single() { this.singleMode = 'single'; return this; }
  abortSignal() { return this; }

  private matching() { return table(this.name).filter((r) => this.filters.every((f) => f(r))); }

  private finish(rows: Row[], cols?: string): Result {
    const list = rows.map((r) => project(r, cols));
    if (this.singleMode) {
      if (this.singleMode === 'single' && list.length !== 1) {
        return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
      }
      return { data: list[0] ?? null, error: null };
    }
    return { data: list, error: null, count: list.length };
  }

  private run(): Result {
    const name = this.name;
    if (this.op === 'select') {
      let rows = this.matching();
      for (const o of [...this.orders].reverse()) {
        rows = [...rows].sort((a, b) => (o.asc ? 1 : -1) * compare(a[o.col], b[o.col]));
      }
      const total = rows.length;
      if (this.from != null) rows = rows.slice(this.from, (this.to ?? rows.length) + 1);
      if (this.lim != null) rows = rows.slice(0, this.lim);
      if (this.countOnly) return { data: null, error: null, count: total };
      const res = this.finish(rows, this.cols);
      if (this.wantCount) res.count = total;
      return res;
    }

    if (this.op === 'insert' || this.op === 'upsert') {
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      const out: Row[] = [];
      for (const item of items) {
        const existing = this.op === 'upsert' && item.id ? table(name).find((r) => r.id === item.id) : undefined;
        if (existing) {
          const err = beforeUpdate(name, existing, item);
          if (err) return { data: null, error: err };
          Object.assign(existing, item, 'updated_at' in existing ? { updated_at: now() } : {});
          emit(name, 'UPDATE', existing, null);
          out.push(existing);
          continue;
        }
        const row: Row = { id: uuid(), created_at: now(), ...(DEFAULTS[name] ?? {}), ...item };
        if (['profiles', 'dues', 'payments', 'tickets', 'news', 'access_codes', 'apartment_types', 'system_settings'].includes(name)) row.updated_at ??= now();
        const err = beforeInsert(name, row);
        if (err) return { data: null, error: err };
        table(name).push(row);
        if (name === 'profiles') issuePermanentToken(row);
        emit(name, 'INSERT', row, null);
        out.push(row);
      }
      save();
      return this.returning !== undefined ? this.finish(out, this.returning) : { data: null, error: null };
    }

    if (this.op === 'update') {
      const patch = this.payload as Row;
      const rows = this.matching();
      for (const r of rows) {
        const err = beforeUpdate(name, r, patch);
        if (err) return { data: null, error: err };
      }
      for (const r of rows) {
        const old = { ...r };
        Object.assign(r, patch);
        if ('updated_at' in r && !('updated_at' in patch)) r.updated_at = now();
        if (name === 'profiles' && patch.apartment_number !== undefined) {
          table('access_tokens').filter((t) => t.user_id === r.id && t.type === 'permanent').forEach((t) => { t.domicile_id = r.apartment_number || 'S/N'; });
        }
        emit(name, 'UPDATE', r, old);
      }
      save();
      return this.returning !== undefined ? this.finish(rows, this.returning) : { data: null, error: null, count: rows.length };
    }

    // delete
    const doomed = new Set(this.matching());
    db.tables[name] = table(name).filter((r) => !doomed.has(r));
    doomed.forEach((r) => emit(name, 'DELETE', null, r));
    save();
    return this.returning !== undefined ? this.finish([...doomed], this.returning) : { data: null, error: null };
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    // Una pausa breve imita la latencia de red y deja ver los estados de carga
    return new Promise<Result>((resolve) => setTimeout(() => resolve(this.run()), 60)).then(ok, fail);
  }
}

// ---------- Funciones (rpc) ----------
async function rpc(fn: string, args: Row = {}): Promise<Result> {
  await new Promise((r) => setTimeout(r, 60));
  const uid = currentUid();
  switch (fn) {
    case 'get_public_profiles': {
      const ids = (args._ids as string[]) ?? [];
      return { data: table('profiles').filter((p) => ids.includes(p.id as string)).map((p) => ({ id: p.id, full_name: p.full_name, apartment_number: p.apartment_number })), error: null };
    }
    case 'has_role': return { data: roleOf(args._user_id as string) === args._role, error: null };
    case 'is_admin': return { data: isAdmin(args._user_id as string), error: null };
    case 'set_user_role': {
      const target = args._target as string;
      const role = args._role as string;
      if (!isAdmin(uid)) return { data: null, error: { message: 'Solo la administración puede cambiar roles', code: '42501' } };
      if (target === uid) return { data: null, error: { message: 'No puedes cambiar tu propio rol', code: '42501' } };
      if ((role === 'super_admin' || roleOf(target) === 'super_admin') && roleOf(uid) !== 'super_admin') {
        return { data: null, error: { message: 'Solo un superadministrador puede asignar o modificar ese rol', code: '42501' } };
      }
      db.tables.user_roles = table('user_roles').filter((r) => r.user_id !== target);
      table('user_roles').push({ id: uuid(), user_id: target, role, created_at: now() });
      save();
      return { data: null, error: null };
    }
    default: return { data: null, error: null };
  }
}

// ---------- Archivos ----------
const readAsDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

const storage = {
  from: (bucket: string) => ({
    upload: async (path: string, file: Blob) => {
      try {
        files.set(`${bucket}/${path}`, await readAsDataUrl(file));
        return { data: { path, fullPath: `${bucket}/${path}` }, error: null };
      } catch {
        return { data: null, error: { message: 'No se pudo leer el archivo' } };
      }
    },
    getPublicUrl: (path: string) => ({ data: { publicUrl: files.get(`${bucket}/${path}`) ?? '' } }),
    createSignedUrl: async (path: string) => ({ data: { signedUrl: files.get(`${bucket}/${path}`) ?? '' }, error: null }),
    remove: async (paths: string[]) => { paths.forEach((p) => files.delete(`${bucket}/${p}`)); return { data: null, error: null }; },
  }),
};

// ---------- Canales ----------
function channel(_name: string) {
  const mine: Subscription[] = [];
  const ch = {
    on(_type: string, opts: { event?: string; table?: string; filter?: string }, cb: (payload: Row) => void) {
      const sub = { table: opts.table ?? '', event: opts.event ?? '*', filter: opts.filter, cb };
      mine.push(sub);
      return ch;
    },
    subscribe(cb?: (status: string) => void) {
      mine.forEach((s) => subscriptions.add(s));
      setTimeout(() => cb?.('SUBSCRIBED'), 0);
      return ch;
    },
    unsubscribe() { mine.forEach((s) => subscriptions.delete(s)); return Promise.resolve('ok'); },
  };
  return ch;
}

// ---------- Edge Functions ----------
// create-resident: misma validación y permisos que la función real (supabase/functions/create-resident)
async function invokeFunction(name: string, opts?: { body?: Row }) {
  await new Promise((r) => setTimeout(r, 150));
  if (name !== 'create-resident') return { data: { success: true, demo: true }, error: null };
  const fail = (message: string) => ({ data: null, error: { message, context: { json: async () => ({ error: message }) } } });
  if (!isAdmin(currentUid())) return fail('Solo la administración puede registrar residentes');
  const b = opts?.body ?? {};
  const created = createAuthUser(String(b.email ?? ''), String(b.password ?? ''), { full_name: b.fullName, phone: b.phone ?? null });
  if (!('id' in created)) {
    const message = String((created as DbError).message);
    return fail(/registered/.test(message) ? 'Ese correo ya está registrado' : message);
  }
  const profile = table('profiles').find((p) => p.id === created.id);
  if (profile) Object.assign(profile, { apartment_number: b.apartment ?? null, phone: b.phone ?? null, nfc_card_id: b.nfc ?? null });
  table('access_tokens').filter((t) => t.user_id === created.id).forEach((t) => { t.domicile_id = b.apartment || 'S/N'; });
  save();
  return { data: { id: created.id }, error: null };
}

// ---------- Autenticación ----------
function makeAuth(isolated: boolean) {
  return {
    getSession: async () => ({ data: { session: isolated ? null : session }, error: null }),
    getUser: async () => ({ data: { user: isolated ? null : session?.user ?? null }, error: null }),
    onAuthStateChange: (cb: AuthListener) => {
      if (!isolated) authListeners.add(cb);
      return { data: { subscription: { unsubscribe: () => authListeners.delete(cb) } } };
    },
    signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
      await new Promise((r) => setTimeout(r, 250));
      const u = table('auth_users').find((x) => x.email === email.trim().toLowerCase());
      if (!u || u.password !== password) return { data: { user: null, session: null }, error: { message: 'Invalid login credentials', status: 400 } };
      const next: DemoSession = { access_token: `demo-${u.id}`, token_type: 'bearer', user: toUser(u), expires_at: Math.floor(Date.now() / 1000) + 86_400 };
      if (!isolated) setSession(next, 'SIGNED_IN');
      return { data: { user: next.user, session: next }, error: null };
    },
    signUp: async ({ email, password, options }: { email: string; password: string; options?: { data?: Record<string, unknown> } }) => {
      const created = createAuthUser(email, password, options?.data ?? {});
      if ('message' in created && !('id' in created)) return { data: { user: null, session: null }, error: created };
      const user = toUser(created as Row);
      if (!isolated) setSession({ access_token: `demo-${user.id}`, token_type: 'bearer', user, expires_at: Math.floor(Date.now() / 1000) + 86_400 }, 'SIGNED_IN');
      return { data: { user, session: null }, error: null };
    },
    signOut: async () => { if (!isolated) setSession(null, 'SIGNED_OUT'); return { error: null }; },
    updateUser: async () => ({ data: { user: session?.user ?? null }, error: null }),
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
  };
}

function makeClient(isolated = false) {
  return {
    from: (name: string) => new Query(name),
    rpc,
    auth: makeAuth(isolated),
    storage,
    channel,
    removeChannel: (ch: { unsubscribe: () => unknown }) => { ch?.unsubscribe?.(); return Promise.resolve('ok'); },
    functions: { invoke: invokeFunction },
  };
}

// El tipo de supabase-js mantiene el tipado de las pantallas; la implementación es la simulada
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export const supabase = makeClient() as unknown as SupabaseClient<Database>;

/** Inicia sesión con una de las cuentas de ejemplo (la contraseña es la misma para todas). */
export const signInAsDemo = (email: string) => (supabase.auth.signInWithPassword({ email, password: DEMO_PASSWORD }));
