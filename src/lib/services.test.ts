/**
 * Servicios que hablan con Supabase, con el cliente simulado.
 */
const mocks = vi.hoisted(() => {
  const invoke = vi.fn();
  const mainSignUp = vi.fn();
  const eq = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  const rpc = vi.fn(async () => ({ data: null, error: null }));
  return { invoke, mainSignUp, eq, update, from, rpc };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc, auth: { signUp: mocks.mainSignUp }, functions: { invoke: mocks.invoke } },
}));

import { createResident, setUserRole } from './adminUsers';
import { fetchPublicProfiles } from './profileDirectory';

beforeEach(() => vi.clearAllMocks());

const valid = { fullName: ' Ana Pérez ', email: ' Ana@Correo.COM ', password: 'Segura2026!', apartment: ' 12 ', phone: '0991234567' };

describe('Alta de residentes', () => {
  test('FRO-U01 valida campos obligatorios', async () => {
    expect((await createResident({ ...valid, fullName: '  ' })).error).toMatch(/obligatorios/);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  test('FRO-U02 exige contraseña inicial de al menos 8 caracteres', async () => {
    expect((await createResident({ ...valid, password: '1234567' })).error).toMatch(/8 caracteres/);
  });

  test('FRO-U03 crea la cuenta con la función create-resident y NO cambia la sesión del administrador', async () => {
    mocks.invoke.mockResolvedValue({ data: { id: 'nuevo' }, error: null });
    const res = await createResident(valid);
    expect(res).toEqual({ id: 'nuevo' });
    expect(mocks.mainSignUp).not.toHaveBeenCalled();
    expect(mocks.invoke).toHaveBeenCalledWith('create-resident', { body: expect.objectContaining({ email: 'ana@correo.com', fullName: 'Ana Pérez' }) });
  });

  test('FRO-U04 envía unidad, teléfono y tarjeta para que la función los asigne', async () => {
    mocks.invoke.mockResolvedValue({ data: { id: 'nuevo' }, error: null });
    await createResident({ ...valid, nfc: ' TAG-1 ' });
    expect(mocks.invoke).toHaveBeenCalledWith('create-resident', {
      body: expect.objectContaining({ apartment: '12', phone: '0991234567', nfc: 'TAG-1' }),
    });
    expect(mocks.update).not.toHaveBeenCalled(); // ya no escribe el perfil desde el navegador
  });

  test('FRO-U05 muestra el motivo que devuelve la función (correo ya registrado)', async () => {
    const context = { json: async () => ({ error: 'Ese correo ya está registrado' }) };
    mocks.invoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context } });
    expect((await createResident(valid)).error).toBe('Ese correo ya está registrado');
  });

  test('FRO-U06 sin cuerpo legible, usa el mensaje de supabase-js', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { message: 'Failed to send a request to the Edge Function' } });
    expect((await createResident(valid)).error).toBe('Failed to send a request to the Edge Function');
  });
});

describe('Cambio de rol', () => {
  test('FRO-U07 usa la función atómica set_user_role (no upsert)', async () => {
    expect(await setUserRole('u1', 'admin')).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith('set_user_role', { _target: 'u1', _role: 'admin' });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  test('FRO-U08 devuelve el mensaje de error de la base de datos', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Solo un superadministrador puede asignar o modificar ese rol' } });
    expect(await setUserRole('u1', 'super_admin')).toMatch(/superadministrador/);
  });
});

describe('Directorio del chat', () => {
  test('FRO-U09 no consulta si no hay remitentes', async () => {
    expect((await fetchPublicProfiles([])).size).toBe(0);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  test('FRO-U10 consulta cada remitente una sola vez y devuelve un mapa por id', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ id: 'b', full_name: 'Bruno', apartment_number: '34' }], error: null });
    const map = await fetchPublicProfiles(['b', 'b', '', 'b']);
    expect(mocks.rpc).toHaveBeenCalledWith('get_public_profiles', { _ids: ['b'] });
    expect(map.get('b')?.full_name).toBe('Bruno');
  });

  test('FRO-U11 si la consulta falla, el chat sigue funcionando sin nombres', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    expect((await fetchPublicProfiles(['b'])).size).toBe(0);
  });
});
