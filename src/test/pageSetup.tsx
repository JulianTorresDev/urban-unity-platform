/**
 * Mocks comunes para probar pantallas completas. Se importa al inicio de cada
 * archivo de prueba de pantallas (antes de importar la pantalla).
 */
import { vi } from 'vitest';
import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/integrations/supabase/client', async () => ({
  supabase: (await import('@/test/supabaseMock')).sb.client,
}));

vi.mock('@/lib/auth', async () => {
  const { auth } = await import('@/test/supabaseMock');
  const passthrough = ({ children }: { children: ReactNode }) => children;
  return { useAuth: () => auth, AuthProvider: passthrough, ProtectedRoute: passthrough, AdminRoute: passthrough, SuperAdminRoute: passthrough };
});

vi.mock('@/lib/theme', async () => {
  const { theme } = await import('@/test/supabaseMock');
  return { useTheme: () => theme, hexToHsl: () => '357 60% 38%' };
});

// El layout (menú, campana, tema) tiene sus propias pruebas; aquí solo importa el contenido
vi.mock('@/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock('sonner', async () => {
  const { toasts } = await import('@/test/supabaseMock');
  return { toast: Object.assign(vi.fn(), toasts), Toaster: () => null };
});

export function renderPage(ui: ReactNode, path = '/') {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[path]}>
      <Routes>
        <Route path="*" element={ui} />
      </Routes>
    </MemoryRouter>
  );
}

/** Fecha futura en ISO, a una hora local dada. */
export function futureAt(daysAhead: number, hour: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}
