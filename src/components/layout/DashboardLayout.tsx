import { ReactNode, useState } from 'react';
import { Menu } from 'lucide-react';
import { ThemeProvider } from 'next-themes';
import Sidebar from './Sidebar';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useTheme } from '@/lib/theme';
import { NotificationsBell } from '@/components/NotificationsBell';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface DashboardLayoutProps {
  children: ReactNode;
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { settings } = useTheme();

  const today = format(new Date(), "EEEE, d 'de' MMMM", { locale: es });

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <div className="min-h-screen bg-background text-foreground">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="lg:pl-[272px] min-h-screen flex flex-col">
          {/* Barra superior translúcida: herramientas globales, sin repetir información del menú */}
          <header className="sticky top-0 z-30 h-14 lg:h-16 bg-background/80 backdrop-blur-xl backdrop-saturate-150 border-b border-border/60">
            <div className="h-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Abrir menú"
                  className="lg:hidden -ml-2 w-11 h-11 rounded-full flex items-center justify-center text-foreground hover:bg-muted transition-colors flex-shrink-0"
                >
                  <Menu className="w-5 h-5" strokeWidth={1.75} />
                </button>
                <span className="lg:hidden text-[15px] font-semibold tracking-tight truncate">
                  {settings.company_name}
                </span>
                <span className="hidden lg:block text-sm text-muted-foreground first-letter:uppercase">
                  {today}
                </span>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <NotificationsBell />
                <ThemeToggle />
              </div>
            </div>
          </header>

          <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8 lg:py-10">
            {children}
          </main>

          <footer className="border-t border-border/60">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
              <p>© {new Date().getFullYear()} {settings.company_name}</p>
              <p>Llano Grande, Quito</p>
            </div>
          </footer>
        </div>
      </div>
    </ThemeProvider>
  );
};

export default DashboardLayout;
