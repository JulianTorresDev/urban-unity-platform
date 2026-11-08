import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, CalendarDays, DollarSign, TrendingUp, Loader2, Download, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { formatUSD } from '@/lib/format';

interface ReservationData {
  id: string;
  resource_id: string;
  start_time: string;
  end_time: string;
  status: string;
  price: number | null;
  resources?: { name: string } | null;
}

const COLORS = ['hsl(var(--primary))', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

const ReservationReports = () => {
  const { isAdmin } = useAuth();
  const [reservations, setReservations] = useState<ReservationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const [selectedPeriodOffset, setSelectedPeriodOffset] = useState(0);

  const dateRange = useMemo(() => {
    const now = new Date();
    if (period === 'week') {
      const ref = subWeeks(now, selectedPeriodOffset);
      return { start: startOfWeek(ref, { locale: es }), end: endOfWeek(ref, { locale: es }) };
    }
    const ref = subMonths(now, selectedPeriodOffset);
    return { start: startOfMonth(ref), end: endOfMonth(ref) };
  }, [period, selectedPeriodOffset]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('reservations')
          .select('id, resource_id, start_time, end_time, status, price, resources(name)')
          .gte('start_time', dateRange.start.toISOString())
          .lte('start_time', dateRange.end.toISOString())
          .order('start_time');

        setReservations((data as ReservationData[]) || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [dateRange]);

  const stats = useMemo(() => {
    const total = reservations.length;
    const confirmed = reservations.filter(r => r.status === 'confirmed').length;
    const pending = reservations.filter(r => r.status === 'pending').length;
    const cancelled = reservations.filter(r => r.status === 'cancelled' || r.status === 'rejected').length;
    const totalRevenue = reservations
      .filter(r => r.status === 'confirmed')
      .reduce((sum, r) => sum + (r.price || 0), 0);

    return { total, confirmed, pending, cancelled, totalRevenue };
  }, [reservations]);

  const byResourceData = useMemo(() => {
    const map: Record<string, { name: string; count: number; revenue: number }> = {};
    reservations.forEach(r => {
      const name = r.resources?.name || 'Desconocido';
      if (!map[name]) map[name] = { name, count: 0, revenue: 0 };
      map[name].count++;
      if (r.status === 'confirmed') map[name].revenue += r.price || 0;
    });
    return Object.values(map);
  }, [reservations]);

  const statusData = useMemo(() => {
    return [
      { name: 'Confirmadas', value: stats.confirmed, color: '#10b981' },
      { name: 'En revisión', value: stats.pending, color: '#f59e0b' },
      { name: 'Canceladas o rechazadas', value: stats.cancelled, color: '#ef4444' },
    ].filter(d => d.value > 0);
  }, [stats]);

  const periodLabel = period === 'week'
    ? `${format(dateRange.start, 'd MMM', { locale: es })} – ${format(dateRange.end, 'd MMM yyyy', { locale: es })}`
    : format(dateRange.start, 'MMMM yyyy', { locale: es });

  const formatPrice = (amount: number) => {
    return formatUSD(amount);
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[13px] font-medium text-primary">
                Reportes
              </span>
            </div>
            <h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold text-foreground tracking-tight">
              Reporte de reservas
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base font-medium">
              Ocupación, recaudación y volumen de reservas por área común.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 bg-background border border-border/80 rounded-xl p-1.5 shadow-xs">
            <Select value={period} onValueChange={(v) => { setPeriod(v as 'week' | 'month'); setSelectedPeriodOffset(0); }}>
              <SelectTrigger className="w-[120px] h-9 border border-border/80 rounded-lg bg-background font-semibold text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border border-border bg-card">
                <SelectItem value="week">Semanal</SelectItem>
                <SelectItem value="month">Mensual</SelectItem>
              </SelectContent>
            </Select>

            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setSelectedPeriodOffset(o => o + 1)}
              className="h-9 px-2.5 font-semibold text-xs text-foreground"
            >
              <ChevronLeft className="w-4 h-4 mr-0.5" />
              Anterior
            </Button>
            <span className="text-xs font-semibold min-w-[130px] text-center capitalize text-foreground px-2">
              {periodLabel}
            </span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setSelectedPeriodOffset(o => Math.max(0, o - 1))} 
              disabled={selectedPeriodOffset === 0}
              className="h-9 px-2.5 font-semibold text-xs text-foreground"
            >
              Siguiente
              <ChevronRight className="w-4 h-4 ml-0.5" />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-2xl bg-card shadow-hairline">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
            <p className="text-xs font-medium text-muted-foreground">Compilando estadísticas...</p>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-card space-y-2 shadow-hairline">
                <p className="text-xs font-medium text-muted-foreground">Total solicitudes</p>
                <p className="text-3xl font-semibold text-foreground">{stats.total}</p>
                <p className="text-xs text-muted-foreground font-medium">En el período seleccionado</p>
              </div>

              <div className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                <p className="text-xs font-semibold text-emerald-700">Autorizadas</p>
                <p className="text-3xl font-semibold text-emerald-600">{stats.confirmed}</p>
                <p className="text-xs text-emerald-700/80 font-semibold">{stats.total > 0 ? `${Math.round((stats.confirmed / stats.total) * 100)}% de aprobación` : '0%'}</p>
              </div>

              <div className="p-5 rounded-2xl border border-primary/30 bg-primary/5 space-y-2">
                <p className="text-xs font-semibold text-primary">Recaudado</p>
                <p className="text-2xl sm:text-3xl font-semibold text-foreground">{formatPrice(stats.totalRevenue)}</p>
                <p className="text-xs text-primary font-semibold">Fondos para el conjunto</p>
              </div>

              <div className="p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-2">
                <p className="text-xs font-semibold text-amber-700">Por aprobar</p>
                <p className="text-3xl font-semibold text-amber-600">{stats.pending}</p>
                <p className="text-xs text-amber-700/80 font-semibold">Pendientes en mesa</p>
              </div>
            </div>

            {/* Graphs Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Bar Chart */}
              <div className="p-6 rounded-2xl bg-card space-y-4 shadow-hairline">
                <div>
                  <h3 className="font-semibold text-base text-foreground">Reservas por área</h3>
                  <p className="text-xs text-muted-foreground font-medium">Número de eventos reservados en el lapso</p>
                </div>

                {byResourceData.length === 0 ? (
                  <div className="py-20 text-center text-muted-foreground text-xs font-medium">
                    Sin reservaciones registradas para este período.
                  </div>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={byResourceData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip 
                          contentStyle={{ 
                            background: 'hsl(var(--card))', 
                            border: '2px solid hsl(var(--border))', 
                            borderRadius: '12px',
                            fontWeight: 700
                          }} 
                        />
                        <Bar dataKey="count" fill="hsl(var(--primary))" name="Reservas" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Status Distribution */}
              <div className="p-6 rounded-2xl bg-card space-y-4 shadow-hairline">
                <div>
                  <h3 className="font-semibold text-base text-foreground">Estado de las reservas</h3>
                  <p className="text-xs text-muted-foreground font-medium">Proporción de reservas autorizadas vs rechazadas</p>
                </div>

                {statusData.length === 0 ? (
                  <div className="py-20 text-center text-muted-foreground text-xs font-medium">
                    Sin datos en este período.
                  </div>
                ) : (
                  <div className="h-64 w-full flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie 
                          data={statusData} 
                          cx="50%" 
                          cy="50%" 
                          outerRadius={80} 
                          dataKey="value" 
                          nameKey="name" 
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {statusData.map((entry, index) => (
                            <Cell key={index} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            {/* Breakdown Table */}
            <div className="rounded-2xl bg-card overflow-hidden shadow-hairline">
              <div className="p-5 bg-muted/40 border-b border-border/70">
                <h3 className="font-semibold text-base text-foreground">Ingresos por área</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/70 bg-muted/20">
                      <th className="text-left py-3.5 px-6 font-medium text-xs text-muted-foreground">Espacio común</th>
                      <th className="text-center py-3.5 px-6 font-medium text-xs text-muted-foreground">Solicitudes</th>
                      <th className="text-center py-3.5 px-6 font-medium text-xs text-muted-foreground">Efectivas</th>
                      <th className="text-right py-3.5 px-6 font-medium text-xs text-muted-foreground">Total recaudado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {byResourceData.map(r => (
                      <tr key={r.name} className="hover:bg-muted/10 transition-colors">
                        <td className="py-3.5 px-6 font-semibold text-foreground">{r.name}</td>
                        <td className="py-3.5 px-6 text-center font-semibold text-muted-foreground">{r.count}</td>
                        <td className="py-3.5 px-6 text-center font-semibold text-emerald-600">
                          {reservations.filter(res => res.resources?.name === r.name && res.status === 'confirmed').length}
                        </td>
                        <td className="py-3.5 px-6 text-right font-semibold text-foreground">{formatPrice(r.revenue)}</td>
                      </tr>
                    ))}
                    <tr className="bg-muted/30 font-semibold">
                      <td className="py-4 px-6 text-foreground">Total</td>
                      <td className="py-4 px-6 text-center text-foreground">{stats.total}</td>
                      <td className="py-4 px-6 text-center text-emerald-600">{stats.confirmed}</td>
                      <td className="py-4 px-6 text-right text-primary text-base">{formatPrice(stats.totalRevenue)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ReservationReports;
