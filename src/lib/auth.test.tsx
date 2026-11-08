/**
 * Rutas protegidas y carga de sesión/rol.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string } },
  roles: [] as { role: string }[],
  roleDelay: 0,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: state.session } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: vi.fn(async () => ({})),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => new Promise((resolve) => setTimeout(() => resolve({ data: state.roles, error: null }), state.roleDelay)),
      }),
    })),
  },
}));

import { AuthProvider, AdminRoute, ProtectedRoute, SuperAdminRoute } from './auth';

function renderAt(path: string) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/admin/users" element={<AdminRoute><p>Panel de residentes</p></AdminRoute>} />
          <Route path="/admin/super" element={<SuperAdminRoute><p>Zona super</p></SuperAdminRoute>} />
          <Route path="/payments" element={<ProtectedRoute><p>Mis pagos</p></ProtectedRoute>} />
          <Route path="/dashboard" element={<p>Inicio del residente</p>} />
          <Route path="/auth" element={<p>Pantalla de acceso</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  state.session = null;
  state.roles = [];
  state.roleDelay = 0;
});

test('FRO-A01 sin sesión, una ruta privada lleva a la pantalla de acceso', async () => {
  renderAt('/payments');
  expect(await screen.findByText('Pantalla de acceso')).toBeInTheDocument();
});

test('FRO-A02 un residente con sesión entra a sus rutas', async () => {
  state.session = { user: { id: 'ana' } };
  state.roles = [{ role: 'resident' }];
  renderAt('/payments');
  expect(await screen.findByText('Mis pagos')).toBeInTheDocument();
});

test('FRO-A03 un residente NO entra a rutas de administración', async () => {
  state.session = { user: { id: 'ana' } };
  state.roles = [{ role: 'resident' }];
  renderAt('/admin/users');
  expect(await screen.findByText('Inicio del residente')).toBeInTheDocument();
  expect(screen.queryByText('Panel de residentes')).not.toBeInTheDocument();
});

test('FRO-A04 al recargar una página de administración no se redirige mientras carga el rol', async () => {
  // Antes: loading terminaba antes del rol y el administrador acababa en /dashboard
  state.session = { user: { id: 'admin' } };
  state.roles = [{ role: 'admin' }];
  state.roleDelay = 50;
  renderAt('/admin/users');
  expect(await screen.findByText('Panel de residentes')).toBeInTheDocument();
  expect(screen.queryByText('Inicio del residente')).not.toBeInTheDocument();
});

test('FRO-A05 un administrador con dos filas de rol sigue siendo administrador', async () => {
  state.session = { user: { id: 'admin' } };
  state.roles = [{ role: 'resident' }, { role: 'admin' }];
  renderAt('/admin/users');
  expect(await screen.findByText('Panel de residentes')).toBeInTheDocument();
});

test('FRO-A06 un administrador NO entra a la zona de superadministrador', async () => {
  state.session = { user: { id: 'admin' } };
  state.roles = [{ role: 'admin' }];
  renderAt('/admin/super');
  await waitFor(() => expect(screen.getByText('Inicio del residente')).toBeInTheDocument());
});

test('FRO-A07 un superadministrador entra a todas las zonas', async () => {
  state.session = { user: { id: 'root' } };
  state.roles = [{ role: 'super_admin' }];
  renderAt('/admin/super');
  expect(await screen.findByText('Zona super')).toBeInTheDocument();
});
