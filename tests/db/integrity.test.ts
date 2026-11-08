// @vitest-environment node
/**
 * SEGURIDAD — Integridad y control de acceso (escalada de privilegios).
 * Lo que un usuario NO debe poder hacer aunque llame a la API directamente,
 * sin pasar por la interfaz.
 */
import { createWorld, World } from './fixtures';

let w: World;
beforeAll(async () => { w = await createWorld(); });
afterAll(async () => { await w.db.close(); });

const statusOf = async (table: string, id: string) =>
  (await w.db.sql<{ status: string }>(`SELECT status FROM public.${table} WHERE id = $1`, [id]))[0].status;

describe('Alícuotas y pagos (S-01)', () => {
  test.each(['dues', 'payments'])('SEG-I01 un residente NO puede marcar como pagado su propio cobro (%s)', async (table) => {
    const id = table === 'dues' ? w.dueAna : w.paymentAna;
    const r = await w.db.as(w.ana, `UPDATE public.${table} SET status = 'paid', paid_at = now() WHERE id = $1 RETURNING id`, [id]);
    expect(r.ok).toBe(false);
    expect(await statusOf(table, id)).toBe('pending');
  });

  test.each(['dues', 'payments'])('SEG-I02 un residente SÍ puede adjuntar su comprobante (%s)', async (table) => {
    const id = table === 'dues' ? w.dueAna : w.paymentAna;
    const r = await w.db.as(w.ana,
      `UPDATE public.${table} SET receipt_url = 'https://x/ana.png', status = 'pending', rejection_reason = NULL WHERE id = $1 RETURNING id`, [id]);
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(1);
  });

  test('SEG-I03 un residente NO puede bajar el monto de su alícuota', async () => {
    const r = await w.db.as(w.ana, `UPDATE public.dues SET amount = 1 WHERE id = $1 RETURNING id`, [w.dueAna]);
    expect(r.ok).toBe(false);
  });

  test('SEG-I04 un residente NO puede alterar un cobro ya verificado', async () => {
    const [{ id }] = await w.db.sql<{ id: string }>(
      `INSERT INTO public.dues (user_id, amount, month, year, status, paid_at) VALUES ($1, 50, 10, 2026, 'paid', now()) RETURNING id`, [w.ana]);
    const r = await w.db.as(w.ana, `UPDATE public.dues SET receipt_url = 'otro.png', status = 'pending' WHERE id = $1 RETURNING id`, [id]);
    expect(r.ok).toBe(false);
    expect(await statusOf('dues', id)).toBe('paid');
  });

  test('SEG-I05 la administración SÍ puede aprobar un pago', async () => {
    const r = await w.db.as(w.admin, `UPDATE public.dues SET status = 'paid', paid_at = now() WHERE id = $1 RETURNING id`, [w.dueBruno]);
    expect(r.ok).toBe(true);
    expect(await statusOf('dues', w.dueBruno)).toBe('paid');
  });

  test('SEG-I06 un residente NO puede crearse cobros ni alícuotas', async () => {
    const r = await w.db.as(w.ana, `INSERT INTO public.dues (user_id, amount, month, year, status) VALUES ($1, 0, 1, 2027, 'paid') RETURNING id`, [w.ana]);
    expect(r.ok).toBe(false);
  });
});

describe('Perfil y suspensión (S-02, S-08)', () => {
  test('SEG-I07 un residente suspendido NO puede reactivarse a sí mismo', async () => {
    const r = await w.db.as(w.blocked, `UPDATE public.profiles SET status = 'active' WHERE id = $1 RETURNING id`, [w.blocked]);
    expect(r.ok).toBe(false);
    expect(await statusOf('profiles', w.blocked)).toBe('blocked');
  });

  test.each([
    ['apartment_type_id', '(SELECT id FROM public.apartment_types LIMIT 1)'],
    ['apartment_number', `'99'`],
    ['email', `'otro@correo.com'`],
    ['nfc_card_id', `'TAG-ROBADO'`],
  ])('SEG-I08 un residente NO puede cambiar su campo protegido %s', async (col, value) => {
    const r = await w.db.as(w.ana, `UPDATE public.profiles SET ${col} = ${value} WHERE id = $1 RETURNING id`, [w.ana]);
    expect(r.ok).toBe(false);
  });

  test('SEG-I09 un residente SÍ puede actualizar su nombre y teléfono', async () => {
    const r = await w.db.as(w.ana, `UPDATE public.profiles SET full_name = 'Ana María Pérez', phone = '0991234567', updated_at = now() WHERE id = $1 RETURNING id`, [w.ana]);
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(1);
  });

  test('SEG-I10 la administración SÍ puede suspender y reactivar residentes', async () => {
    const r1 = await w.db.as(w.admin, `UPDATE public.profiles SET status = 'blocked' WHERE id = $1 RETURNING id`, [w.bruno]);
    const r2 = await w.db.as(w.admin, `UPDATE public.profiles SET status = 'active' WHERE id = $1 RETURNING id`, [w.bruno]);
    expect(r1.ok && r2.ok).toBe(true);
  });

  test('SEG-I11 un residente suspendido NO puede escribir en el chat', async () => {
    const r = await w.db.as(w.blocked, `INSERT INTO public.chat_messages (sender_id, content) VALUES ($1, 'hola') RETURNING id`, [w.blocked]);
    expect(r.ok).toBe(false);
  });

  test('SEG-I12 un residente suspendido SÍ puede abrir una solicitud para reclamar', async () => {
    const r = await w.db.as(w.blocked,
      `INSERT INTO public.tickets (user_id, subject, description, category) VALUES ($1, 'Pago hecho', 'Ya transferí', 'other') RETURNING id`, [w.blocked]);
    expect(r.ok).toBe(true);
  });
});

describe('Roles (S-04)', () => {
  test('SEG-I13 un residente NO puede darse el rol de administrador', async () => {
    const r = await w.db.as(w.ana, `INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'admin') RETURNING id`, [w.ana]);
    expect(r.ok).toBe(false);
    const r2 = await w.db.as(w.ana, `UPDATE public.user_roles SET role = 'super_admin' WHERE user_id = $1 RETURNING id`, [w.ana]);
    expect(r2.rows).toHaveLength(0);
  });

  test('SEG-I14 un residente NO puede usar set_user_role', async () => {
    const r = await w.db.as(w.ana, `SELECT public.set_user_role($1, 'admin')`, [w.bruno]);
    expect(r.ok).toBe(false);
  });

  test('SEG-I15 un administrador NO puede otorgar super_admin', async () => {
    const r = await w.db.as(w.admin, `SELECT public.set_user_role($1, 'super_admin')`, [w.bruno]);
    expect(r.ok).toBe(false);
  });

  test('SEG-I16 un administrador NO puede degradar a un super_admin', async () => {
    const r = await w.db.as(w.admin, `SELECT public.set_user_role($1, 'resident')`, [w.superAdmin]);
    expect(r.ok).toBe(false);
  });

  test('SEG-I17 nadie puede cambiar su propio rol (evita quedarse sin administración)', async () => {
    const r = await w.db.as(w.admin, `SELECT public.set_user_role($1, 'resident')`, [w.admin]);
    expect(r.ok).toBe(false);
  });

  test('FUN-R01 promover a administrador deja exactamente un rol por usuario', async () => {
    const r = await w.db.as(w.admin, `SELECT public.set_user_role($1, 'admin')`, [w.bruno]);
    expect(r.ok).toBe(true);
    const roles = await w.db.sql<{ role: string }>(`SELECT role FROM public.user_roles WHERE user_id = $1`, [w.bruno]);
    expect(roles.map((x) => x.role)).toEqual(['admin']);
    // y lo devuelve a residente
    await w.db.as(w.admin, `SELECT public.set_user_role($1, 'resident')`, [w.bruno]);
    const after = await w.db.sql<{ role: string }>(`SELECT role FROM public.user_roles WHERE user_id = $1`, [w.bruno]);
    expect(after.map((x) => x.role)).toEqual(['resident']);
  });

  test('FUN-R02 un super_admin SÍ puede otorgar super_admin', async () => {
    const tmp = await w.db.createUser('nuevo-super@gissels2.test');
    const r = await w.db.as(w.superAdmin, `SELECT public.set_user_role($1, 'super_admin')`, [tmp]);
    expect(r.ok).toBe(true);
  });
});

describe('Token QR (S-05)', () => {
  test('SEG-I18 un residente NO puede crearse tokens de acceso', async () => {
    const r = await w.db.as(w.ana,
      `INSERT INTO public.access_tokens (user_id, domicile_id, token, type) VALUES ($1, '12', 'mi-token', 'temporary') RETURNING id`, [w.ana]);
    expect(r.ok).toBe(false);
  });

  test('SEG-I19 un residente NO puede reescribir su token (p. ej. copiar el de un vecino)', async () => {
    const r = await w.db.as(w.ana, `UPDATE public.access_tokens SET token = 'copiado' WHERE user_id = $1 RETURNING id`, [w.ana]);
    expect(r.rows).toHaveLength(0);
  });
});

describe('Contenido administrado', () => {
  test.each([
    ['news', `INSERT INTO public.news (title, content) VALUES ('Falso', 'Falso') RETURNING id`],
    ['resources', `INSERT INTO public.resources (name) VALUES ('Mi garaje') RETURNING id`],
    ['apartment_types', `INSERT INTO public.apartment_types (name, monthly_fee) VALUES ('Gratis', 0) RETURNING id`],
    ['system_settings', `UPDATE public.system_settings SET company_name = 'Hackeado' RETURNING id`],
    ['access_codes', `INSERT INTO public.access_codes (code, type) VALUES ('PASE-FALSO', 'visitor') RETURNING id`],
  ])('SEG-I20 un residente NO puede escribir en %s', async (_t, query) => {
    const r = await w.db.as(w.ana, query);
    expect(r.ok && r.rows.length > 0).toBe(false);
  });

  test('SEG-I21 la administración SÍ puede publicar comunicados y cambiar la marca', async () => {
    const r1 = await w.db.as(w.admin, `INSERT INTO public.news (title, content) VALUES ('Asamblea', 'Viernes 19:00') RETURNING id`);
    const r2 = await w.db.as(w.admin, `UPDATE public.system_settings SET primary_color = '#0071e3' RETURNING id`);
    expect(r1.ok && r2.ok).toBe(true);
  });

  test.each([
    ['tarifa negativa de un área', `UPDATE public.resources SET base_price = -5 RETURNING id`],
    ['máximo de horas fuera de rango', `UPDATE public.resources SET max_hours_per_booking = 48 RETURNING id`],
    ['cuota negativa de un tipo de departamento', `INSERT INTO public.apartment_types (name, monthly_fee) VALUES ('Error', -1) RETURNING id`],
    ['cargo con monto negativo', `INSERT INTO public.payments (user_id, description, amount, due_date, payment_type) SELECT id, 'x', -20, '2026-12-01', 'fine' FROM public.profiles LIMIT 1 RETURNING id`],
  ])('SEG-I30 ni siquiera la administración puede guardar datos inválidos: %s', async (_l, query) => {
    const r = await w.db.as(w.admin, query);
    expect(r.ok).toBe(false);
  });

  test('SEG-I22 el color de marca debe ser hexadecimal válido', async () => {
    const r = await w.db.as(w.admin, `UPDATE public.system_settings SET primary_color = 'red; background:url(x)' RETURNING id`);
    expect(r.ok).toBe(false);
  });
});

describe('Solicitudes, notificaciones y chat', () => {
  test('SEG-I23 un residente NO puede crear una solicitud ya "resuelta" ni escribir la respuesta oficial', async () => {
    const r = await w.db.as<{ status: string; admin_notes: string | null }>(w.ana,
      `INSERT INTO public.tickets (user_id, subject, description, category, status, admin_notes)
       VALUES ($1, 'Test', 'Test', 'other', 'resolved', 'Aprobado por mí') RETURNING status, admin_notes`, [w.ana]);
    expect(r.ok).toBe(true);
    expect(r.rows[0]).toEqual({ status: 'open', admin_notes: null });
  });

  test('SEG-I24 un residente NO puede cambiar el estado de su solicitud', async () => {
    const r = await w.db.as(w.ana, `UPDATE public.tickets SET status = 'closed' WHERE id = $1 RETURNING id`, [w.ticketAna]);
    expect(r.rows).toHaveLength(0);
  });

  test('SEG-I25 un residente NO puede enviar notificaciones a otros', async () => {
    const r = await w.db.as(w.ana, `INSERT INTO public.notifications (user_id, title, message) VALUES ($1, 'Pago', 'Paga aquí: http://phishing') RETURNING id`, [w.bruno]);
    expect(r.ok).toBe(false);
  });

  test('SEG-I26 la administración SÍ puede notificar a cualquier residente', async () => {
    const r = await w.db.as(w.admin, `INSERT INTO public.notifications (user_id, title, message) VALUES ($1, 'Pago aprobado', 'Gracias') RETURNING id`, [w.bruno]);
    expect(r.ok).toBe(true);
  });

  test('SEG-I27 un residente NO puede escribir en el chat suplantando a otro', async () => {
    const r = await w.db.as(w.ana, `INSERT INTO public.chat_messages (sender_id, content) VALUES ($1, 'Soy Bruno') RETURNING id`, [w.bruno]);
    expect(r.ok).toBe(false);
  });

  test('SEG-I28 un residente NO puede borrar mensajes de otros', async () => {
    const r = await w.db.as(w.ana, `DELETE FROM public.chat_messages WHERE sender_id = $1 RETURNING id`, [w.bruno]);
    expect(r.rows).toHaveLength(0);
  });

  test('SEG-I29 el chat rechaza mensajes vacíos o de más de 2000 caracteres', async () => {
    const empty = await w.db.as(w.ana, `INSERT INTO public.chat_messages (sender_id, content) VALUES ($1, '   ') RETURNING id`, [w.ana]);
    const huge = await w.db.as(w.ana, `INSERT INTO public.chat_messages (sender_id, content) VALUES ($1, repeat('a', 2001)) RETURNING id`, [w.ana]);
    expect(empty.ok).toBe(false);
    expect(huge.ok).toBe(false);
  });

  test('FUN-H01 el chat acepta una foto sin texto', async () => {
    const r = await w.db.as(w.ana,
      `INSERT INTO public.chat_messages (sender_id, content, image_url) VALUES ($1, '', 'https://cdn.test/chat_images/foto.jpg') RETURNING id`, [w.ana]);
    expect(r.ok).toBe(true);
  });
});
