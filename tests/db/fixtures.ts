import { createTestDb, TestDb } from './harness';

export interface World {
  db: TestDb;
  superAdmin: string;
  admin: string;
  ana: string; // residente, depto 12
  bruno: string; // residente, depto 34
  blocked: string; // residente suspendido, depto 56
  salon: string; // recurso "Salón Social" (base 25, máx. 4 h, 08:00–22:00)
  piscina: string;
  dueAna: string;
  dueBruno: string;
  paymentAna: string;
  ticketAna: string;
}

/** Comunidad de prueba con un usuario por rol y datos de cada módulo. */
export async function createWorld(): Promise<World> {
  const db = await createTestDb();

  const superAdmin = await db.createUser('julian@gissels2.test', { fullName: 'Julián Torres', role: 'super_admin' });
  const admin = await db.createUser('admin@gissels2.test', { fullName: 'Administración', role: 'admin' });
  const ana = await db.createUser('ana@gissels2.test', { fullName: 'Ana Pérez', apartment: '12' });
  const bruno = await db.createUser('bruno@gissels2.test', { fullName: 'Bruno Ruiz', apartment: '34' });
  const blocked = await db.createUser('moroso@gissels2.test', { fullName: 'Carlos Mora', apartment: '56', status: 'blocked' });

  const [{ id: salon }] = await db.sql<{ id: string }>(`SELECT id FROM public.resources WHERE name = 'Salón Social'`);
  const [{ id: piscina }] = await db.sql<{ id: string }>(`SELECT id FROM public.resources WHERE name <> 'Salón Social' LIMIT 1`);

  const [{ id: dueAna }] = await db.sql<{ id: string }>(
    `INSERT INTO public.dues (user_id, amount, month, year) VALUES ($1, 50, 11, 2026) RETURNING id`, [ana]);
  const [{ id: dueBruno }] = await db.sql<{ id: string }>(
    `INSERT INTO public.dues (user_id, amount, month, year) VALUES ($1, 50, 11, 2026) RETURNING id`, [bruno]);
  const [{ id: paymentAna }] = await db.sql<{ id: string }>(
    `INSERT INTO public.payments (user_id, description, amount, due_date, payment_type)
     VALUES ($1, 'Multa por ruido', 20, '2026-12-01', 'fine') RETURNING id`, [ana]);
  const [{ id: ticketAna }] = await db.sql<{ id: string }>(
    `INSERT INTO public.tickets (user_id, subject, description, category)
     VALUES ($1, 'Fuga en el pasillo', 'Hay agua en el piso del bloque B', 'maintenance') RETURNING id`, [ana]);

  await db.sql(`INSERT INTO public.news (title, content, author_id) VALUES ('Corte de agua', 'El jueves de 9 a 12', $1)`, [admin]);
  await db.sql(`INSERT INTO public.notifications (user_id, title, message) VALUES ($1, 'Hola Ana', 'Privado'), ($2, 'Hola Bruno', 'Privado')`, [ana, bruno]);
  await db.sql(`INSERT INTO public.chat_messages (sender_id, content) VALUES ($1, 'Buenos días, vecinos')`, [bruno]);

  return { db, superAdmin, admin, ana, bruno, blocked, salon, piscina, dueAna, dueBruno, paymentAna, ticketAna };
}
