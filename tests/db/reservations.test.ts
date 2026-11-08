// @vitest-environment node
/**
 * FUNCIONAL — Reserva de áreas comunes "sin cruces de horario" (anteproyecto).
 * Las reglas se validan en la base de datos, así que se cumplen aunque dos
 * residentes reserven a la vez o alguien llame a la API sin la interfaz.
 */
import { at } from './harness';
import { createWorld, World } from './fixtures';

let w: World;
beforeAll(async () => { w = await createWorld(); });
afterAll(async () => { await w.db.close(); });

const reserve = (uid: string, resource: string, start: string, end: string, extra = '') =>
  w.db.as<{ id: string; status: string; price: string }>(uid,
    `INSERT INTO public.reservations (user_id, resource_id, start_time, end_time${extra ? ', status, price' : ''})
     VALUES ($1, $2, $3, $4${extra}) RETURNING id, status, price`,
    [uid, resource, start, end]);

describe('Crear reservas', () => {
  test('FUN-V01 un residente crea una reserva pendiente con el precio calculado por el sistema', async () => {
    const r = await reserve(w.ana, w.salon, at(5, 10), at(5, 12));
    expect(r.ok).toBe(true);
    expect(r.rows[0].status).toBe('pending');
    expect(Number(r.rows[0].price)).toBe(25); // base 25 + 0 por hora
  });

  test('SEG-V02 el residente NO puede autoconfirmarse ni fijar precio 0', async () => {
    const r = await reserve(w.ana, w.salon, at(6, 10), at(6, 11), `, 'confirmed', 0`);
    expect(r.ok).toBe(true);
    expect(r.rows[0].status).toBe('pending');
    expect(Number(r.rows[0].price)).toBe(25);
  });

  test('FUN-V03 rechaza una reserva que se cruza con otra vigente', async () => {
    const r = await reserve(w.bruno, w.salon, at(5, 11), at(5, 13));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ya se encuentra reservado/);
  });

  test('FUN-V04 permite reservas contiguas (una termina cuando empieza la otra)', async () => {
    const r = await reserve(w.bruno, w.salon, at(5, 12), at(5, 14));
    expect(r.ok).toBe(true);
  });

  test('FUN-V05 permite el mismo horario en otra área', async () => {
    const r = await reserve(w.bruno, w.piscina, at(5, 10), at(5, 12));
    expect(r.ok).toBe(true);
  });

  test('FUN-V06 una reserva cancelada libera el horario', async () => {
    const first = await reserve(w.ana, w.salon, at(8, 9), at(8, 10));
    await w.db.as(w.ana, `UPDATE public.reservations SET status = 'cancelled' WHERE id = $1`, [first.rows[0].id]);
    const second = await reserve(w.bruno, w.salon, at(8, 9), at(8, 10));
    expect(second.ok).toBe(true);
  });

  test.each([
    ['en el pasado', at(-1, 10), at(-1, 11), /pasado/],
    ['con fin antes del inicio', at(9, 12), at(9, 10), /posterior/],
    ['de más horas que el máximo del área (4 h)', at(9, 9), at(9, 15), /máximo/],
    ['fuera del horario hábil (07:00)', at(9, 7), at(9, 9), /entre/],
    ['que cruza la medianoche', at(9, 21), at(10, 0, 30), /entre/],
  ])('FUN-V07 rechaza una reserva %s', async (_label, start, end, msg) => {
    const r = await reserve(w.ana, w.salon, start, end);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(msg);
  });

  test('SEG-V08 un residente suspendido NO puede reservar', async () => {
    const r = await reserve(w.blocked, w.salon, at(11, 10), at(11, 11));
    expect(r.ok).toBe(false);
  });

  test('SEG-V09 un residente NO puede reservar a nombre de otro', async () => {
    const r = await w.db.as(w.ana,
      `INSERT INTO public.reservations (user_id, resource_id, start_time, end_time) VALUES ($1, $2, $3, $4) RETURNING id`,
      [w.bruno, w.salon, at(12, 10), at(12, 11)]);
    expect(r.ok).toBe(false);
  });
});

describe('Cancelar, aprobar y rechazar', () => {
  let anaRes: string;
  beforeAll(async () => {
    anaRes = (await reserve(w.ana, w.salon, at(14, 10), at(14, 11))).rows[0].id;
  });

  test('SEG-V10 un residente NO puede cancelar la reserva de otro', async () => {
    const r = await w.db.as(w.bruno, `UPDATE public.reservations SET status = 'cancelled' WHERE id = $1 RETURNING id`, [anaRes]);
    expect(r.rows).toHaveLength(0);
  });

  test('SEG-V11 un residente NO puede confirmar su propia reserva', async () => {
    const r = await w.db.as(w.ana, `UPDATE public.reservations SET status = 'confirmed' WHERE id = $1 RETURNING id`, [anaRes]);
    expect(r.ok).toBe(false);
  });

  test('SEG-V12 un residente NO puede mover el horario de su reserva', async () => {
    const r = await w.db.as(w.ana, `UPDATE public.reservations SET start_time = $2, end_time = $3 WHERE id = $1 RETURNING id`,
      [anaRes, at(14, 15), at(14, 16)]);
    expect(r.ok).toBe(false);
  });

  test('FUN-V13 la administración aprueba una reserva pendiente', async () => {
    const r = await w.db.as<{ status: string }>(w.admin, `UPDATE public.reservations SET status = 'confirmed' WHERE id = $1 RETURNING status`, [anaRes]);
    expect(r.ok).toBe(true);
    expect(r.rows[0].status).toBe('confirmed');
  });

  test('FUN-V14 la administración rechaza con motivo', async () => {
    const id = (await reserve(w.bruno, w.salon, at(15, 10), at(15, 11))).rows[0].id;
    const r = await w.db.as<{ status: string; rejection_reason: string }>(w.admin,
      `UPDATE public.reservations SET status = 'rejected', rejection_reason = 'Mantenimiento' WHERE id = $1 RETURNING status, rejection_reason`, [id]);
    expect(r.rows[0]).toEqual({ status: 'rejected', rejection_reason: 'Mantenimiento' });
  });

  test('FUN-V15 un residente cancela su reserva vigente', async () => {
    const r = await w.db.as<{ status: string }>(w.ana, `UPDATE public.reservations SET status = 'cancelled' WHERE id = $1 RETURNING status`, [anaRes]);
    expect(r.ok).toBe(true);
    expect(r.rows[0].status).toBe('cancelled');
  });

  test('FUN-V16 la administración tampoco puede crear cruces de horario', async () => {
    const a = await w.db.as(w.admin,
      `INSERT INTO public.reservations (user_id, resource_id, start_time, end_time, status) VALUES ($1, $2, $3, $4, 'confirmed') RETURNING id`,
      [w.bruno, w.salon, at(20, 10), at(20, 12)]);
    const b = await w.db.as(w.admin,
      `INSERT INTO public.reservations (user_id, resource_id, start_time, end_time, status) VALUES ($1, $2, $3, $4, 'confirmed') RETURNING id`,
      [w.ana, w.salon, at(20, 11), at(20, 13)]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
  });
});
