import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/StatCard';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { 
  DollarSign, 
  Users, 
  MessageSquare, 
  Calendar,
  TrendingUp,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

const AdminOverview = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalRevenue: 0,
    pendingPayments: 0,
    activeUsers: 0,
    openTickets: 0,
  });
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [ticketData, setTicketData] = useState<any[]>([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      
      // 1. Fetch Basic Stats
      const { data: payments } = await supabase
        .from('payments')
        .select('amount, status, created_at');
      
      const revenue = payments?.filter(p => p.status === 'paid').reduce((sum, p) => sum + Number(p.amount), 0) || 0;
      const pending = payments?.filter(p => p.status === 'pending' || p.status === 'overdue').reduce((sum, p) => sum + Number(p.amount), 0) || 0;

      const { count: usersCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      const { count: ticketsCount } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open');

      setStats({
        totalRevenue: revenue,
        pendingPayments: pending,
        activeUsers: usersCount || 0,
        openTickets: ticketsCount || 0,
      });

      // 2. Process Revenue Data for Chart (Last 6 months)
      const last6Months = Array.from({ length: 6 }, (_, i) => subMonths(new Date(), i)).reverse();
      const revenueByMonth = last6Months.map(date => {
        const monthStart = startOfMonth(date);
        const monthEnd = endOfMonth(date);
        const monthPayments = payments?.filter(p => {
          const pDate = new Date(p.created_at);
          return p.status === 'paid' && pDate >= monthStart && pDate <= monthEnd;
        });
        return {
          name: format(date, 'MMM', { locale: es }),
          value: monthPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0
        };
      });
      setRevenueData(revenueByMonth);

      // 3. Process Ticket Categories
      const { data: tickets } = await supabase.from('tickets').select('category');
      const categories = ['suggestion', 'complaint', 'maintenance', 'other'];
      const categoryLabels: Record<string, string> = {
        suggestion: 'Sugerencia',
        complaint: 'Queja',
        maintenance: 'Mantenimiento',
        other: 'Otros'
      };
      
      const ticketCounts = categories.map(cat => ({
        name: categoryLabels[cat],
        value: tickets?.filter(t => t.category === cat).length || 0
      })).filter(c => c.value > 0);
      
      setTicketData(ticketCounts.length > 0 ? ticketCounts : [{ name: 'Sin Datos', value: 1 }]);

      setLoading(false);
    };

    fetchDashboardData();
  }, []);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="animate-fade-in">
          <h1 className="font-display text-4xl font-black text-foreground tracking-tight">Panel Gerencial</h1>
          <p className="text-muted-foreground mt-1 font-medium">
            Control ejecutivo del rendimiento financiero y operativo de la comunidad
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <StatCard
            title="Recaudación Total"
            value={`$${stats.totalRevenue.toLocaleString()}`}
            subtitle="Pagos procesados con éxito"
            icon={DollarSign}
            variant="success"
          />
          <StatCard
            title="Cartera por Cobrar"
            value={`$${stats.pendingPayments.toLocaleString()}`}
            subtitle="Pendiente de recaudo"
            icon={AlertCircle}
            variant="warning"
          />
          <StatCard
            title="Residentes Activos"
            value={stats.activeUsers.toString()}
            subtitle="En la base de datos"
            icon={Users}
          />
          <StatCard
            title="Tickets Pendientes"
            value={stats.openTickets.toString()}
            subtitle="Requieren atención"
            icon={MessageSquare}
            variant="destructive"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          {/* Revenue Chart */}
          <Card className="card-elevated border-none shadow-2xl bg-card/50 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl font-bold">
                <TrendingUp className="w-6 h-6 text-primary" />
                Histórico de Recaudación
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[350px] pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 600 }}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={4} 
                    dot={{ r: 6, fill: 'hsl(var(--primary))', strokeWidth: 2, stroke: 'white' }} 
                    activeDot={{ r: 8, strokeWidth: 0 }} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Ticket Categories */}
          <Card className="card-elevated border-none shadow-2xl bg-card/50 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl font-bold">
                <MessageSquare className="w-6 h-6 text-primary" />
                Distribución de PQR
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[350px] pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={ticketData}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={110}
                    fill="#8884d8"
                    paddingAngle={8}
                    dataKey="value"
                  >
                    {ticketData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-6 flex-wrap mt-2">
                {ticketData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{entry.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity / Users Table */}
        <Card className="card-elevated border-none shadow-2xl bg-card/50 backdrop-blur-md animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-3 text-xl font-bold">
                <Calendar className="w-6 h-6 text-primary" />
                Flujo Operativo
              </CardTitle>
              <Button variant="outline" className="rounded-full font-bold">Ver Reporte Detallado</Button>
            </div>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 600 }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminOverview;
