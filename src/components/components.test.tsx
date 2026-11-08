/**
 * Componentes compartidos y navegación por rol.
 */
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const m = vi.hoisted(() => ({ role: 'resident' as string, isAdmin: false }));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ role: m.role, isAdmin: m.isAdmin, user: { id: 'u1', email: 'ana@correo.com' }, signOut: vi.fn() }),
}));
vi.mock('@/lib/theme', () => ({
  useTheme: () => ({ settings: { company_name: "Gissel's 2", logo_url: null, primary_color: '#0071e3' } }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { full_name: 'Ana Pérez', apartment_number: '12' } }) }) }) }),
  },
}));

import Sidebar from './layout/Sidebar';
import { StatusBadge } from './ui/StatusBadge';
import { StatCard } from './ui/StatCard';
import { CountUp } from './motion/CountUp';
import NotFound from '@/pages/NotFound';
import { DollarSign } from 'lucide-react';

const nav = () => within(screen.getByRole('navigation', { name: 'Menú principal' }));

describe('Menú lateral según el rol', () => {
  test('FRO-N01 el residente ve sus módulos y ninguno de administración', async () => {
    m.role = 'resident'; m.isAdmin = false;
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/dues']}><Sidebar isOpen onClose={() => {}} /></MemoryRouter>);
    for (const label of ['Inicio', 'Comunicados', 'Alícuotas', 'Pagos', 'Acceso QR', 'Mis accesos', 'Reservas', 'Solicitudes', 'Chat']) {
      expect(nav().getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(nav().queryByRole('link', { name: 'Residentes' })).not.toBeInTheDocument();
    expect(nav().queryByRole('link', { name: 'Garita QR' })).not.toBeInTheDocument();
    expect(nav().getByRole('link', { name: 'Alícuotas' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByText('Departamento 12')).toBeInTheDocument();
  });

  test('FRO-N02 la administración ve los módulos de gestión', async () => {
    m.role = 'admin'; m.isAdmin = true;
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Sidebar isOpen onClose={() => {}} /></MemoryRouter>);
    for (const label of ['Resumen', 'Alícuotas', 'Cobranza', 'Residentes', 'Reservas', 'Reporte de reservas', 'Áreas y tarifas', 'Solicitudes', 'Garita QR', 'Pases de acceso', 'Marca del conjunto']) {
      expect(nav().getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(nav().getByRole('link', { name: 'Alícuotas' })).toHaveAttribute('href', '/admin/dues');
    await screen.findByText('Ana Pérez');
  });

  test('FRO-N03 cerrar sesión tiene nombre accesible', async () => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Sidebar isOpen onClose={() => {}} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    await screen.findByText('Ana Pérez');
  });
});

describe('Componentes de interfaz', () => {
  test.each([
    ['success', 'Pagada'],
    ['warning', 'En revisión'],
    ['destructive', 'Vencida'],
    ['muted', 'Cerrada'],
  ] as const)('FRO-C01 StatusBadge muestra el texto del estado %s (no depende solo del color)', (status, text) => {
    render(<StatusBadge status={status}>{text}</StatusBadge>);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  test('FRO-C02 con "reducir movimiento", las cifras muestran su valor final de inmediato', () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...original(q), matches: q.includes('reduce') })) as typeof window.matchMedia;
    render(<CountUp value={1250.5} format={(n) => `$${n.toFixed(2)}`} />);
    expect(screen.getByText('$1250.50')).toBeInTheDocument();
    window.matchMedia = original;
  });

  test('FRO-C03 StatCard muestra título, valor y subtítulo', () => {
    render(<StatCard title="Por cobrar" value="$120.00" subtitle="Cartera pendiente" icon={DollarSign} />);
    expect(screen.getByText('Por cobrar')).toBeInTheDocument();
    expect(screen.getByText('$120.00')).toBeInTheDocument();
    expect(screen.getByText('Cartera pendiente')).toBeInTheDocument();
  });

  test('FRO-C04 la página 404 está en español y ofrece volver al inicio', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/no-existe']}><NotFound /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'No encontramos esta página' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
  });
});
