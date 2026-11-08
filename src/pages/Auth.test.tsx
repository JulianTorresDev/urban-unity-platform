/**
 * Pantalla de acceso: validación, credenciales incorrectas y cuenta suspendida.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const m = vi.hoisted(() => ({
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  status: 'active',
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: null, loading: false, signIn: m.signIn, signOut: m.signOut }),
}));

vi.mock('@/lib/theme', () => ({
  useTheme: () => ({ settings: { company_name: "Gestor Residencial — Gissel's 2", logo_url: null, primary_color: '#0071e3' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { status: m.status } }) }) }) }),
  },
}));

import Auth from './Auth';

const renderAuth = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Auth /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  m.status = 'active';
});

test('FRO-L01 el formulario tiene etiquetas visibles y autocompletado correcto', () => {
  renderAuth();
  expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('autocomplete', 'email');
  expect(screen.getByLabelText('Contraseña')).toHaveAttribute('autocomplete', 'current-password');
  expect(screen.getByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
});

test('FRO-L02 rechaza un correo inválido sin llamar al servidor', async () => {
  renderAuth();
  await userEvent.type(screen.getByLabelText('Correo electrónico'), 'no-es-correo');
  await userEvent.type(screen.getByLabelText('Contraseña'), 'secreta123');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('correo electrónico válido');
  expect(m.signIn).not.toHaveBeenCalled();
});

test('FRO-L03 rechaza contraseñas de menos de 6 caracteres', async () => {
  renderAuth();
  await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@correo.com');
  await userEvent.type(screen.getByLabelText('Contraseña'), '123');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('al menos 6 caracteres');
});

test('FRO-L04 credenciales incorrectas: mensaje claro, sin revelar cuál dato falló', async () => {
  m.signIn.mockResolvedValue({ error: new Error('Invalid login credentials') });
  renderAuth();
  await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@correo.com');
  await userEvent.type(screen.getByLabelText('Contraseña'), 'equivocada');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('El correo o la contraseña no son correctos.');
});

test('FRO-L05 una cuenta suspendida se cierra y muestra el aviso', async () => {
  m.signIn.mockResolvedValue({ error: null });
  m.status = 'blocked';
  renderAuth();
  await userEvent.type(screen.getByLabelText('Correo electrónico'), 'moroso@correo.com');
  await userEvent.type(screen.getByLabelText('Contraseña'), 'correcta123');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  expect(await screen.findByText('Tu acceso está suspendido')).toBeInTheDocument();
  expect(m.signOut).toHaveBeenCalled();
});
