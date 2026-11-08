import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '@/lib/theme';
import {
  Home,
  Newspaper,
  CreditCard,
  Calendar,
  MessageSquare,
  MessageCircle,
  Users,
  LogOut,
  Building2,
  X,
  DollarSign,
  Receipt,
  LayoutDashboard,
  Palette,
  QrCode,
  ShieldCheck,
  KeyRound,
  BarChart3,
  LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  icon: LucideIcon;
  label: string;
  path: string;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const location = useLocation();
  const { role, signOut, user, isAdmin } = useAuth();
  const { settings } = useTheme();
  const [profile, setProfile] = useState<{ full_name: string | null; apartment_number: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, apartment_number')
        .eq('id', user.id)
        .maybeSingle();
      if (data) setProfile(data);
    };
    fetchProfile();
  }, [user]);

  // Navegación agrupada por tarea: secciones cortas que se escanean de un vistazo
  const getSections = (): NavSection[] => {
    if (isAdmin) {
      return [
        {
          items: [
            { icon: LayoutDashboard, label: 'Resumen', path: '/admin' },
            { icon: Newspaper, label: 'Comunicados', path: '/news' },
          ],
        },
        {
          title: 'Finanzas',
          items: [
            { icon: Receipt, label: 'Alícuotas', path: '/admin/dues' },
            { icon: CreditCard, label: 'Cobranza', path: '/admin/payments' },
          ],
        },
        {
          title: 'Comunidad',
          items: [
            { icon: Users, label: 'Residentes', path: '/admin/users' },
            { icon: Calendar, label: 'Reservas', path: '/admin/reservations' },
            { icon: BarChart3, label: 'Reporte de reservas', path: '/admin/reports' },
            { icon: DollarSign, label: 'Áreas y tarifas', path: '/admin/resources' },
            { icon: MessageSquare, label: 'Solicitudes', path: '/admin/tickets' },
            { icon: MessageCircle, label: 'Chat', path: '/chat' },
          ],
        },
        {
          title: 'Seguridad',
          items: [
            { icon: ShieldCheck, label: 'Garita QR', path: '/admin/verify-qr' },
            { icon: KeyRound, label: 'Pases de acceso', path: '/admin/access' },
          ],
        },
        {
          title: 'Ajustes',
          items: [{ icon: Palette, label: 'Marca del conjunto', path: '/admin/settings' }],
        },
      ];
    }

    const base: NavSection = {
      items: [
        { icon: Home, label: 'Inicio', path: '/dashboard' },
        { icon: Newspaper, label: 'Comunicados', path: '/news' },
      ],
    };

    if (role === 'resident') {
      return [
        base,
        {
          title: 'Mi hogar',
          items: [
            { icon: Receipt, label: 'Alícuotas', path: '/dues' },
            { icon: CreditCard, label: 'Pagos', path: '/payments' },
            { icon: QrCode, label: 'Acceso QR', path: '/access' },
            { icon: KeyRound, label: 'Mis accesos', path: '/my-access' },
          ],
        },
        {
          title: 'Comunidad',
          items: [
            { icon: Calendar, label: 'Reservas', path: '/reservations' },
            { icon: MessageSquare, label: 'Solicitudes', path: '/tickets' },
            { icon: MessageCircle, label: 'Chat', path: '/chat' },
          ],
        },
      ];
    }

    return [base];
  };

  const sections = getSections();

  useEffect(() => {
    onClose();
  }, [location.pathname]);

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Usuario';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  const subtitle = isAdmin
    ? 'Administración'
    : profile?.apartment_number
    ? `Departamento ${profile.apartment_number}`
    : 'Residente';

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40 lg:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          'fixed left-0 top-0 h-[100dvh] w-[272px] bg-sidebar border-r border-sidebar-border flex flex-col z-50 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          'lg:translate-x-0',
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        )}
      >
        {/* Marca */}
        <div className="h-16 px-5 flex items-center justify-between flex-shrink-0">
          <Link to={isAdmin ? '/admin' : '/dashboard'} className="flex items-center gap-3 min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ backgroundColor: settings.logo_url ? 'transparent' : settings.primary_color || '#0071e3' }}
            >
              {settings.logo_url ? (
                <img src={settings.logo_url} alt="" className="w-full h-full object-contain" />
              ) : (
                <Building2 className="w-[18px] h-[18px] text-white" strokeWidth={1.75} />
              )}
            </div>
            <span className="text-sm font-semibold leading-tight tracking-tight text-foreground line-clamp-2">
              {settings.company_name || "Gissel's 2"}
            </span>
          </Link>

          <button
            onClick={onClose}
            aria-label="Cerrar menú"
            className="lg:hidden -mr-2 w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>

        {/* Navegación */}
        <nav className="flex-1 px-3 pb-4 overflow-y-auto scrollbar-custom" aria-label="Menú principal">
          {sections.map((section, i) => (
            <div key={section.title ?? i} className={cn(i > 0 && 'mt-6')}>
              {section.title && (
                <p className="px-3 mb-1 text-xs font-medium text-muted-foreground">{section.title}</p>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'relative flex items-center gap-3 h-11 px-3 rounded-lg text-[15px] transition-colors duration-150',
                          isActive
                            ? 'text-foreground font-medium'
                            : 'text-foreground/75 hover:text-foreground hover:bg-sidebar-accent'
                        )}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="sidebar-active-indicator"
                            className="absolute inset-0 rounded-lg bg-sidebar-accent"
                            transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
                          />
                        )}
                        <item.icon
                          className={cn(
                            'relative w-[18px] h-[18px] flex-shrink-0',
                            isActive ? 'text-primary' : 'text-muted-foreground'
                          )}
                          strokeWidth={1.75}
                        />
                        <span className="relative truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Cuenta */}
        <div className="p-3 border-t border-sidebar-border flex items-center gap-1 flex-shrink-0">
          <Link
            to="/profile"
            className={cn(
              'flex-1 min-w-0 flex items-center gap-3 p-2 rounded-lg transition-colors',
              location.pathname === '/profile' ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent'
            )}
          >
            <div className="w-9 h-9 rounded-full bg-muted text-foreground/80 flex items-center justify-center text-[13px] font-semibold flex-shrink-0">
              {initials || '?'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
            </div>
          </Link>

          <button
            onClick={signOut}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
          >
            <LogOut className="w-[18px] h-[18px]" strokeWidth={1.75} />
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
