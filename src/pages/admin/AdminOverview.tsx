import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { 
  DollarSign, 
  Users, 
  MessageSquare, 
  TrendingUp, 
  AlertCircle, 
  Loader2, 
  Receipt, 
  Palette, 
  ShieldCheck, 
  ArrowRight, 
  CheckCircle2, 
  Eye, 
  Building2, 
  Check, 
  XCircle, 
  Sparkles,
  Calendar,
  Layers,
  KeyRound,
  Clock,
  FileText
} from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { stagger, fadeUp } from '@/lib/motion';
import { toast } from 'sonner';
import { getReceiptUrl, clearLocalReceipt } from '@/lib/receiptStorage';
import { approvalUpdate, rejectionUpdate } from '@/lib/receiptReview';
import { formatUSD } from '@/lib/format';

interface PendingReceiptDue {
  id: string;
  user_id: string;
  amount: number;
  month: number;
  year: number;
  receipt_url: string;
  profiles?: {
    full_name: string | null;
    email: string;
    apartment_number: string | null;
  };
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const containerVariants = stagger;
const itemVariants = fadeUp;

const AdminOverview = () => {
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalRevenue: 0,
    pendingPayments: 0,
    activeUsers: 0,
    openTickets: 0,
    pendingDuesReceipts: 0,
  });
  const [pendingQueue, setPendingQueue] = useState<PendingReceiptDue[]>([]);
  const [revenueData, setRevenueData] = useState<{ name: string; value: number }[]>([]);
  const [ticketData, setTicketData] = useState<{ name: string; value: number }[]>([]);

  const fetchExecutiveData = async () => {
    setLoading(true);
    
    const [paymentsRes, duesRes, profilesRes, ticketsRes] = await Promise.all([
      supabase.from('payments').select('amount, status, created_at'),
      supabase.from('dues').select('*'),
      supabase.from('profiles').select('id, full_name, email, apartment_number'),
      supabase.from('tickets').select('category, status'),
    ]);

    const payments = paymentsRes.data || [];
    const dues = duesRes.data || [];
    const profiles = profilesRes.data || [];
    const profileMap = new Map(profiles.map(p => [p.id, p]));

    // Ingresos totales
    const paymentsRev = payments.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0);
    const duesRev = dues.filter(d => d.status === 'paid').reduce((s, d) => s + Number(d.amount), 0);
    const totalRevenue = paymentsRev + duesRev;

    // Cartera pendiente
    const paymentsPend = payments.filter(p => p.status === 'pending' || p.status === 'overdue').reduce((s, p) => s + Number(p.amount), 0);
    const duesPend = dues.filter(d => d.status === 'pending' || d.status === 'overdue').reduce((s, d) => s + Number(d.amount), 0);
    const pendingPayments = paymentsPend + duesPend;

    // Comprobantes pendientes de revisión
    const waitingDues = dues
      .map(d => ({
        ...d,
        receipt_url: getReceiptUrl(d.id, d.receipt_url),
        profiles: profileMap.get(d.user_id),
      }))
      .filter(d => d.status !== 'paid' && Boolean(d.receipt_url)) as PendingReceiptDue[];

    setPendingQueue(waitingDues);

    const tickets = ticketsRes.data || [];
    const openTickets = tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length;

    setStats({
      totalRevenue,
      pendingPayments,
      activeUsers: profiles.length,
      openTickets,
      pendingDuesReceipts: waitingDues.length,
    });

    // Gráfico de tendencia 6 meses
    const last6Months = Array.from({ length: 6 }, (_, i) => subMonths(new Date(), i)).reverse();
    const trend = last6Months.map(date => {
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      const mDues = dues.filter(d => {
        const dDate = new Date(d.created_at);
        return d.status === 'paid' && dDate >= start && dDate <= end;
      }).reduce((s, d) => s + Number(d.amount), 0);
      return {
        name: format(date, 'MMM', { locale: es }),
        value: mDues,
      };
    });
    setRevenueData(trend);

    // Categorías PQR
    const categories = ['maintenance', 'complaint', 'suggestion', 'other'];
    const labels: Record<string, string> = {
      maintenance: 'Mantenimiento',
      complaint: 'Quejas',
      suggestion: 'Sugerencias',
      other: 'Otros'
    };
    const tData = categories.map(cat => ({
      name: labels[cat],
      value: tickets.filter(t => t.category === cat).length || 0,
    })).filter(c => c.value > 0);

    setTicketData(tData.length > 0 ? tData : [{ name: 'Sin solicitudes', value: 1 }]);
    setLoading(false);
  };

  useEffect(() => {
    fetchExecutiveData();
  }, []);

  // APROBACIÓN 1-CLICK DIRECTA DESDE EL ESCRITORIO
  const handleQuickApprove = async (due: PendingReceiptDue) => {
    setActionLoadingId(due.id);
    const { error } = await supabase
      .from('dues')
      .update(approvalUpdate())
      .eq('id', due.id);

    if (error) {
      toast.error('Error al aprobar: ' + error.message);
    } else {
      toast.success(`Alícuota de ${due.profiles?.full_name || 'residente'} aprobada.`);
      // Notificar
      try {
        await supabase.from('notifications').insert({
          user_id: due.user_id,
          title: `Alícuota aprobada - ${MONTHS[due.month - 1]} ${due.year}`,
          message: `Tu comprobante de pago por $${Number(due.amount).toFixed(2)} ha sido verificado con éxito.`,
          type: 'success',
          link: '/dues',
        });
      } catch (e) {
        console.warn(e);
      }
      fetchExecutiveData();
    }
    setActionLoadingId(null);
  };

  const handleQuickReject = async (due: PendingReceiptDue) => {
    setActionLoadingId(due.id);
    clearLocalReceipt(due.id);
    const { error } = await supabase
      .from('dues')
      .update(rejectionUpdate())
      .eq('id', due.id);

    if (error) {
      toast.error('Error al rechazar: ' + error.message);
    } else {
      toast.warning('Comprobante rechazado. Se notificó al residente.');
      try {
        await supabase.from('notifications').insert({
          user_id: due.user_id,
          title: `Comprobante rechazado - ${MONTHS[due.month - 1]} ${due.year}`,
          message: `El comprobante no pudo validarse. Por favor sube una captura clara.`,
          type: 'warning',
          link: '/dues',
        });
      } catch (e) {
        console.warn(e);
      }
      fetchExecutiveData();
    }
    setActionLoadingId(null);
  };

  // Paleta categórica sobria: acento de marca seguido de tonos apagados
  const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];
  const money = (n: number) =>
    formatUSD(n);
  const hasTickets = !(ticketData.length === 1 && ticketData[0]?.name === 'Sin solicitudes');

  const tooltipStyle = {
    backgroundColor: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 10,
    boxShadow: '0 12px 24px -6px rgb(0 0 0 / 0.08)',
    fontSize: 13,
    padding: '8px 12px',
  };

  return (
    <DashboardLayout>
      <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-10">
        {/* Cabecera */}
        <motion.header variants={itemVariants} className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="eyebrow first-letter:uppercase">{format(new Date(), 'MMMM yyyy', { locale: es })}</p>
            <h1 className="mt-1 text-[28px] sm:text-[32px] leading-tight font-semibold tracking-tight">Resumen</h1>
            <p className="mt-1.5 text-[15px] text-muted-foreground">
              Recaudación, comprobantes por revisar y solicitudes de los residentes.
            </p>
          </div>
          <div className="flex gap-3">
            <Button asChild variant="outline">
              <Link to="/admin/settings">
                <Palette />
                Marca
              </Link>
            </Button>
            <Button asChild>
              <Link to="/admin/dues">
                <Receipt />
                Revisar alícuotas
                {stats.pendingDuesReceipts > 0 && (
                  <span className="ml-0.5 min-w-5 h-5 px-1.5 rounded-full bg-white/20 text-xs tabular-nums flex items-center justify-center">
                    {stats.pendingDuesReceipts}
                  </span>
                )}
              </Link>
            </Button>
          </div>
        </motion.header>

        {/* Métricas */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Recaudado" value={loading ? '—' : stats.totalRevenue} format={money} subtitle="Cuotas conciliadas" icon={DollarSign} variant="success" />
          <StatCard title="Por cobrar" value={loading ? '—' : stats.pendingPayments} format={money} subtitle="Cartera pendiente" icon={AlertCircle} variant="warning" />
          <StatCard title="Residentes" value={loading ? '—' : stats.activeUsers} subtitle="Registrados en el sistema" icon={Users} />
          <StatCard title="Solicitudes abiertas" value={loading ? '—' : stats.openTickets} subtitle="En atención" icon={MessageSquare} variant="primary" />
        </motion.div>

        {/* Comprobantes por revisar */}
        {pendingQueue.length > 0 && (
          <motion.section variants={itemVariants} aria-labelledby="queue-title">
            <div className="flex items-baseline justify-between mb-3 px-1">
              <div className="flex items-center gap-2.5">
                <h2 id="queue-title" className="text-lg font-semibold tracking-tight">Comprobantes por revisar</h2>
                <StatusBadge status="warning" showIcon={false}>{pendingQueue.length}</StatusBadge>
              </div>
              <Link to="/admin/dues" className="text-sm text-primary hover:underline underline-offset-4">
                Ver todos
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingQueue.slice(0, 3).map((item) => {
                const isActing = actionLoadingId === item.id;
                return (
                  <article key={item.id} className="surface overflow-hidden flex flex-col">
                    <div className="h-40 bg-muted border-b border-border/70 flex items-center justify-center">
                      {item.receipt_url.endsWith('.pdf') ? (
                        <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                          <FileText className="w-6 h-6" strokeWidth={1.5} />
                          Documento PDF
                        </div>
                      ) : (
                        <img src={item.receipt_url} alt={`Comprobante de ${item.profiles?.full_name || 'residente'}`} className="w-full h-full object-cover img-outline" />
                      )}
                    </div>

                    <div className="p-5 flex-1 flex flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[15px] font-medium truncate">{item.profiles?.full_name || 'Residente'}</p>
                          <p className="text-sm text-muted-foreground">
                            {item.profiles?.apartment_number ? `Depto. ${item.profiles.apartment_number}` : 'Sin unidad'} · {MONTHS[item.month - 1]} {item.year}
                          </p>
                        </div>
                        <p className="text-[15px] font-semibold tabular-nums">{money(Number(item.amount))}</p>
                      </div>

                      <div className="mt-auto pt-5 grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          disabled={isActing}
                          onClick={() => handleQuickReject(item)}
                          className="text-destructive hover:text-destructive"
                        >
                          Rechazar
                        </Button>
                        <Button disabled={isActing} onClick={() => handleQuickApprove(item)}>
                          {isActing ? <Loader2 className="animate-spin" /> : <Check />}
                          Aprobar
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </motion.section>
        )}

        {/* Análisis */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 surface p-6" aria-labelledby="revenue-title">
            <h2 id="revenue-title" className="text-[15px] font-semibold tracking-tight">Recaudación por alícuotas</h2>
            <p className="text-sm text-muted-foreground">Últimos 6 meses</p>

            <div className="mt-6 h-[260px] -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    tickFormatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={52}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    tickFormatter={(v: number) => `$${v}`}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={tooltipStyle}
                    formatter={(val: number | string) => [money(Number(val)), 'Recaudado']}
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="surface p-6 flex flex-col" aria-labelledby="tickets-title">
            <h2 id="tickets-title" className="text-[15px] font-semibold tracking-tight">Tipos de solicitudes</h2>
            <p className="text-sm text-muted-foreground">Reportes de residentes</p>

            {hasTickets ? (
              <>
                <div className="h-[180px] mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={ticketData} cx="50%" cy="50%" innerRadius={56} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">
                        {ticketData.map((_, i) => <Cell key={`c-${i}`} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <ul className="mt-4 space-y-2.5">
                  {ticketData.map((entry, index) => (
                    <li key={entry.name} className="flex items-center gap-2.5 text-sm">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="flex-1 truncate">{entry.name}</span>
                      <span className="tabular-nums text-muted-foreground">{entry.value}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="flex-1 flex items-center justify-center py-12 text-sm text-muted-foreground">
                {loading ? 'Cargando…' : 'Sin solicitudes registradas.'}
              </p>
            )}
          </section>
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
};

export default AdminOverview;
