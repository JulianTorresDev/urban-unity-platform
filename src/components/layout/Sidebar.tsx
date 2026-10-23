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
  Settings,
  DollarSign,
  Receipt,
  LayoutDashboard,
  Palette,
  QrCode,
  ShieldCheck,
  ChevronRight,
  User
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const location = useLocation();
  const { role, signOut, user, isAdmin, isSuperAdmin } = useAuth();
  const { settings } = useTheme();

  const getNavItems = () => {
    const baseItems = [
      { icon: Home, label: 'Inicio', path: '/dashboard' },
      { icon: Newspaper, label: 'Noticias', path: '/news' },
    ];

    if (role === 'resident') {
      return [
        ...baseItems,
        { icon: CreditCard, label: 'Mis Pagos', path: '/payments' },
        { icon: Receipt, label: 'Mis Alícuotas', path: '/dues' },
        { icon: Calendar, label: 'Reservas', path: '/reservations' },
        { icon: MessageSquare, label: 'Tickets / PQR', path: '/tickets' },
        { icon: MessageCircle, label: 'Chat Comunitario', path: '/chat' },
        { icon: QrCode, label: 'Acceso QR', path: '/access' },
      ];
    }

    if (isAdmin) {
      return [
        { icon: LayoutDashboard, label: 'Vista General', path: '/admin' },
        ...baseItems,
        { icon: Users, label: 'Control de Acceso', path: '/admin/users' },
        { icon: ShieldCheck, label: 'Lector QR', path: '/admin/verify-qr' },
        { icon: CreditCard, label: 'Gestión de Pagos', path: '/admin/payments' },
        { icon: Receipt, label: 'Gestión Alícuotas', path: '/admin/dues' },
        { icon: Calendar, label: 'Gestión Reservas', path: '/admin/reservations' },
        { icon: DollarSign, label: 'Precios de Recursos', path: '/admin/resources' },
        { icon: MessageSquare, label: 'Gestión de Tickets', path: '/admin/tickets' },
        { icon: MessageCircle, label: 'Chat', path: '/chat' },
        { icon: Palette, label: 'Configuración Sistema', path: '/admin/settings' },
      ];
    }

    return baseItems;
  };

  const navItems = getNavItems();

  useEffect(() => {
    onClose();
  }, [location.pathname]);

  return (
    <>
      {/* Overlay for mobile */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" 
            onClick={onClose}
          />
        )}
      </AnimatePresence>
      
      <aside className={cn(
        "fixed left-0 top-0 h-screen w-72 bg-sidebar border-r border-sidebar-border flex flex-col z-50 transition-all duration-500 ease-in-out shadow-2xl lg:shadow-none",
        "lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Close button for mobile */}
        <button 
          onClick={onClose}
          className="lg:hidden absolute top-5 right-5 p-2 rounded-xl bg-sidebar-accent/50 text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Logo Section */}
        <div className="p-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary shadow-lg shadow-primary/30 flex items-center justify-center overflow-hidden flex-shrink-0">
              {settings.logo_url ? (
                <img src={settings.logo_url} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <Building2 className="w-7 h-7 text-primary-foreground" />
              )}
            </div>
            <div className="flex-1 truncate">
              <h1 className="font-display font-black text-xl text-sidebar-foreground leading-none truncate">
                {settings.company_name}
              </h1>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mt-1.5 opacity-80">
                {role === 'super_admin' ? 'Super Admin' : role === 'admin' ? 'Administrador' : 'Residente'}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto scrollbar-custom">
          <div className="px-4 mb-4 mt-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sidebar-foreground/30">Menú Principal</p>
          </div>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-200 group relative overflow-hidden',
                  isActive 
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 font-bold' 
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground font-medium'
                )}
              >
                <item.icon className={cn("w-5 h-5 transition-transform group-hover:scale-110", isActive ? "text-white" : "text-primary/60 group-hover:text-primary")} />
                <span className="flex-1">{item.label}</span>
                {isActive && (
                  <motion.div layoutId="activeNav" className="absolute right-2 w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Info & Footer */}
        <div className="p-6 mt-auto border-t border-sidebar-border bg-sidebar-accent/20">
          <div className="flex items-center gap-3 mb-6 px-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 shadow-inner">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 truncate">
              <p className="text-xs font-black text-sidebar-foreground/80 truncate">{user?.email?.split('@')[0]}</p>
              <p className="text-[9px] font-bold text-muted-foreground truncate opacity-60 italic">{user?.email}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Link
              to="/profile"
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm',
                location.pathname === '/profile' 
                  ? 'bg-primary/10 text-primary border border-primary/20' 
                  : 'text-sidebar-foreground/60 hover:bg-sidebar-accent'
              )}
            >
              <Settings className="w-4 h-4" />
              <span>Mi Perfil</span>
            </Link>
            <button
              onClick={signOut}
              className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm text-rose-500 hover:bg-rose-500/10 w-full"
            >
              <LogOut className="w-4 h-4" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
          
          <div className="mt-6 text-center">
            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-sidebar-foreground/20">Gestor Residencial Gissel's 2 · v2.0</p>
          </div>
        </div>
      </aside>

      <style>{`
        .scrollbar-custom::-webkit-scrollbar {
          width: 4px;
        }
        .scrollbar-custom::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-custom::-webkit-scrollbar-thumb {
          background: hsl(var(--sidebar-foreground) / 0.1);
          border-radius: 10px;
        }
        .scrollbar-custom::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--primary) / 0.2);
        }
      `}</style>
    </>
  );
};

export default Sidebar;
