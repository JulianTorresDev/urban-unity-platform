// Crea las cuentas iniciales del Gestor Residencial Gissel's 2 con la API de administración
// (funciona aunque los registros públicos estén desactivados) y les asigna su rol.
//
// Uso:
//   node --env-file=.env scripts/seed_users.mjs            crea las cuentas que falten y fija su rol
//   node --env-file=.env scripts/seed_users.mjs --verify   comprueba que cada cuenta puede iniciar sesión
//
// Las credenciales NO se guardan en el repositorio: copia scripts/seed-users.example.json a
// scripts/seed-users.local.json (ignorado por git) y escribe allí correos, contraseñas y roles.
//
// La clave de servicio se toma de SUPABASE_SERVICE_ROLE_KEY o, si no está, se pide a la CLI de
// Supabase con tu sesión (npx supabase login). Nunca se escribe en disco.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const PROJECT = process.env.VITE_SUPABASE_PROJECT_ID;
const FILE = new globalThis.URL('./seed-users.local.json', import.meta.url);
const ROLES = ['resident', 'admin', 'super_admin'];

const fail = (msg) => { console.error(msg); process.exit(1); };
if (!URL || !ANON || !PROJECT) fail('Faltan las variables de Supabase (usa --env-file=.env).');
if (!existsSync(FILE)) fail('No existe scripts/seed-users.local.json. Cópialo desde seed-users.example.json.');

const users = JSON.parse(readFileSync(FILE, 'utf8'));
for (const u of users) {
  if (!u.email || !u.password) fail(`Falta correo o contraseña en ${JSON.stringify(u)}`);
  if (/cambia-esta/i.test(u.password)) fail(`Cambia la contraseña de ejemplo de ${u.email} antes de crear la cuenta.`);
  if (u.password.length < 8) fail(`La contraseña de ${u.email} debe tener al menos 8 caracteres.`);
  if (u.role && !ROLES.includes(u.role)) fail(`Rol desconocido para ${u.email}: ${u.role} (usa ${ROLES.join(', ')}).`);
}

if (process.argv.includes('--verify')) {
  for (const u of users) {
    const client = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data, error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) {
      console.log(`LOGIN ${u.email}: ERROR -> ${error.message}`);
      continue;
    }
    const { data: roles } = await client.from('user_roles').select('role').eq('user_id', data.user.id);
    console.log(`LOGIN ${u.email}: OK  rol=${roles?.map((r) => r.role).join(',') || 'sin rol'}`);
    await client.auth.signOut();
  }
  process.exit(0);
}

function serviceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const out = execSync(`npx -y supabase@2 projects api-keys --project-ref ${PROJECT} -o json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const keys = JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1));
    const key = keys.find((k) => k.name === 'service_role')?.api_key;
    if (key) return key;
  } catch { /* sin sesión en la CLI */ }
  fail('No se pudo obtener la clave de servicio. Inicia sesión con "npx supabase login" o define SUPABASE_SERVICE_ROLE_KEY.');
}

const admin = createClient(URL, serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });

const existing = new Map();
for (let page = 1; ; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) fail(`No se pudo listar las cuentas: ${error.message}`);
  data.users.forEach((x) => existing.set(x.email?.toLowerCase(), x.id));
  if (data.users.length < 200) break;
}

for (const u of users) {
  const email = u.email.trim().toLowerCase();
  let id = existing.get(email);
  if (id) {
    console.log(`CUENTA ${email}: ya existía`);
  } else {
    // El trigger handle_new_user crea el perfil, el rol de residente y la llave QR
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.full_name ?? email, phone: u.phone ?? null },
    });
    if (error) {
      console.log(`CUENTA ${email}: ERROR -> ${error.message}`);
      continue;
    }
    id = data.user.id;
    console.log(`CUENTA ${email}: creada`);
  }

  if (u.apartment || u.phone) {
    await admin.from('profiles').update({ apartment_number: u.apartment ?? null, phone: u.phone ?? null }).eq('id', id);
  }
  const role = u.role ?? 'resident';
  // Un solo rol por persona (como set_user_role); con la clave de servicio no aplican las políticas
  await admin.from('user_roles').delete().eq('user_id', id);
  const { error: roleError } = await admin.from('user_roles').insert({ user_id: id, role });
  console.log(`  rol ${role}: ${roleError ? 'ERROR -> ' + roleError.message : 'asignado'}`);
}
