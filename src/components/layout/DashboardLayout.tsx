import { ReactNode, useState } from 'react';
import { Menu } from 'lucide-react';
import { ThemeProvider } from 'next-themes';
import Sidebar from './Sidebar';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useTheme } from '@/lib/theme';
import { NotificationsBell } from '@/components/NotificationsBell';

interface DashboardLayoutProps {
  children: ReactNode;
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { settings } = useTheme();

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <div className="min-h-screen bg-background">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        
        {/* Mobile header with hamburger */}
        <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-sidebar/80 backdrop-blur-xl border-b border-sidebar-border/50 z-30 flex items-center justify-between px-4">
          <div className="flex items-center">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="ml-3 font-display font-black text-lg text-sidebar-foreground tracking-tight">{settings.company_name}</h1>
          </div>
          <div className="flex items-center gap-1">
            <NotificationsBell />
            <ThemeToggle />
          </div>
        </div>

        {/* Desktop top-right controls */}
        <div className="hidden lg:flex fixed top-4 right-4 z-30 items-center gap-1">
          <NotificationsBell />
          <ThemeToggle />
        </div>

        <main className="lg:ml-72 min-h-screen">
          <div className="p-4 pt-20 lg:p-10 lg:pt-10">
            {children}
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
};

export default DashboardLayout;
