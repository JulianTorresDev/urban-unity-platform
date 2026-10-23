// Crea los usuarios iniciales del Gestor Residencial Gissel's 2
// Uso: node scripts/seed_users.mjs [--verify]
import { createClient } from '@supabase/supabase-js';

const URL = 'https://taofpvayosiltmqnzomf.supabase.co/rest/v1/';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhb2ZwdmF5b3NpbHRtcW56b21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NzY0NzgsImV4cCI6MjA5NDI1MjQ3OH0.SO6ecUwn7FH8s6Z9MX6AMzxZ4AQ7mQYMZ3Hnf5p7br0';

const users = [
  { email: 'julytorreta@gmail.com', password: 'Gissels2.Admin#2026', full_name: 'Julián Torres' },
  { email: 'julytorreta+administracion@gmail.com', password: 'Gissels2.Gestion#2026', full_name: 'Administración General' },
  { email: 'julytorreta+casa12@gmail.com', password: 'Gissels2.Casa12#2026', full_name: 'María Pérez' },
  { email: 'julytorreta+casa34@gmail.com', password: 'Gissels2.Casa34#2026', full_name: 'Carlos Ruiz' },
];

const verify = process.argv.includes('--verify');

for (const u of users) {
  const supabase = createClient(URL, ANON);
  if (verify) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) {
      console.log(`LOGIN ${u.email}: ERROR -> ${error.message}`);
    } else {
      const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', data.user.id);
      console.log(`LOGIN ${u.email}: OK  rol=${roles?.map(r => r.role).join(',') || 'sin rol'}`);
      await supabase.auth.signOut();
    }
  } else {
    const { data, error } = await supabase.auth.signUp({
      email: u.email,
      password: u.password,
      options: { data: { full_name: u.full_name } },
    });
    console.log(`SIGNUP ${u.email}: ${error ? 'ERROR -> ' + error.message : 'OK user=' + !!data.user + ' session=' + !!data.session}`);
  }
}
