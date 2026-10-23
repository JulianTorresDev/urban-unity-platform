import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatCard } from '@/components/ui/StatCard';
import { BarChart3, CalendarDays, DollarSign, TrendingUp, Loader2, Download } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface ReservationData {
  id: string;
  resource_id: string;
  start_time: string;
  end_time: string;
  status: string;
  price: number | null;
  resources?: { name: string } | null;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', '#8b5cf6', '#ec4899'];

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
      const { data } = await supabase
        .from('reservations')
        .select('id, resource_id, start_time, end_time, status, price, resources(name)')
        .gte('start_time', dateRange.start.toISOString())
        .lte('start_time', dateRange.end.toISOString())
        .order('start_time');

      setReservations((data as ReservationData[]) || []);
      setLoading(false);
    };
    fetchData();
  }, [dateRange]);

  const stats = useMemo(() => {
    const total = reservations.length;
    const confirmed = reservations.filter(r => r.status === 'confirmed').length;
    const pending = reservations.filter(r => r.status === 'pending').length;
    const cancelled = reservations.filter(r => r.status === 'cancelled').length;
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
      { name: 'Confirmadas', value: stats.confirmed, color: 'hsl(var(--success))' },
      { name: 'Pendientes', value: stats.pending, color: 'hsl(var(--warning))' },
      { name: 'Canceladas', value: stats.cancelled, color: 'hsl(var(--destructive))' },
    ].filter(d => d.value > 0);
  }, [stats]);

  const periodLabel = period === 'week'
    ? `${format(dateRange.start, 'd MMM', { locale: es })} - ${format(dateRange.end, 'd MMM yyyy', { locale: es })}`
    : format(dateRange.start, 'MMMM yyyy', { locale: es });

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold">Acceso Denegado</h2>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-primary" />
              Reportes de Reservaciones
            </h1>
            <p className="text-muted-foreground mt-1">
              Estadísticas y ganancias por período
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={(v) => { setPeriod(v as 'week' | 'month'); setSelectedPeriodOffset(0); }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Semanal</SelectItem>
                <SelectItem value="month">Mensual</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setSelectedPeriodOffset(o => o + 1)}>
              ← Anterior
            </Button>
            <span className="text-sm font-medium min-w-[160px] text-center capitalize">{periodLabel}</span>
            <Button variant="outline" size="sm" onClick={() => setSelectedPeriodOffset(o => Math.max(0, o - 1))} disabled={selectedPeriodOffset === 0}>
              Siguiente →
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard title="Total Reservaciones" value={stats.total} icon={CalendarDays} variant="primary" />
              <StatCard title="Confirmadas" value={stats.confirmed} icon={TrendingUp} variant="success" />
              <StatCard title="Ganancias Totales" value={`$${stats.totalRevenue.toFixed(2)}`} icon={DollarSign} variant="success" />
              <StatCard title="Tasa de Aprobación" value={stats.total > 0 ? `${Math.round((stats.confirmed / stats.total) * 100)}%` : '0%'} icon={BarChart3} variant="primary" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle>Reservaciones por Recurso</CardTitle>
                  <CardDescription>Cantidad y ganancia por recurso</CardDescription>
                </CardHeader>
                <CardContent>
                  {byResourceData.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Sin datos para este período</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={byResourceData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip
                          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                        />
                        <Bar yAxisId="left" dataKey="count" fill="hsl(var(--primary))" name="Cantidad" radius={[4, 4, 0, 0]} />
                        <Bar yAxisId="right" dataKey="revenue" fill="hsl(var(--success))" name="Ganancia ($)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle>Estado de Reservaciones</CardTitle>
                  <CardDescription>Distribución por estado</CardDescription>
                </CardHeader>
                <CardContent>
                  {statusData.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Sin datos para este período</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie data={statusData} cx="50%" cy="50%" outerRadius={100} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                          {statusData.map((entry, index) => (
                            <Cell key={index} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Detail table */}
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>Detalle de Ganancias por Recurso</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-semibold">Recurso</th>
                        <th className="text-center py-3 px-4 font-semibold">Reservaciones</th>
                        <th className="text-center py-3 px-4 font-semibold">Confirmadas</th>
                        <th className="text-right py-3 px-4 font-semibold">Ganancia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byResourceData.map(r => (
                        <tr key={r.name} className="border-b border-border/50">
                          <td className="py-3 px-4 font-medium">{r.name}</td>
                          <td className="py-3 px-4 text-center">{r.count}</td>
                          <td className="py-3 px-4 text-center">
                            {reservations.filter(res => res.resources?.name === r.name && res.status === 'confirmed').length}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-primary">${r.revenue.toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr className="font-bold">
                        <td className="py-3 px-4">Total</td>
                        <td className="py-3 px-4 text-center">{stats.total}</td>
                        <td className="py-3 px-4 text-center">{stats.confirmed}</td>
                        <td className="py-3 px-4 text-right text-primary">${stats.totalRevenue.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ReservationReports;
