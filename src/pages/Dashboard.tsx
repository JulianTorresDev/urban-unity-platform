import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/ui/StatCard';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Newspaper, CreditCard, Calendar, MessageSquare, DollarSign, AlertCircle, QrCode, ArrowRight, User, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion } from 'framer-motion';

interface NewsItem {
  id: string;
  title: string;
  content: string;
  created_at: string;
  image_url?: string | null;
}

interface PaymentSummary {
  total: number;
  pending: number;
  overdue: number;
}

const Dashboard = () => {
  const { user, role, isAdmin } = useAuth();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary>({ total: 0, pending: 0, overdue: 0 });
  const [upcomingReservations, setUpcomingReservations] = useState(0);
  const [openTickets, setOpenTickets] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!user) return;

      const { data: newsData } = await supabase
        .from('news')
        .select('id, title, content, created_at, image_url')
        .order('created_at', { ascending: false })
        .limit(3);
      
      if (newsData) setNews(newsData);

      if (!isAdmin) {
        const { data: paymentsData } = await supabase
          .from('payments')
          .select('amount, status')
          .eq('user_id', user.id);
        
        if (paymentsData) {
          const summary = paymentsData.reduce((acc, p) => {
            acc.total += Number(p.amount);
            if (p.status === 'pending') acc.pending += Number(p.amount);
            if (p.status === 'overdue') acc.overdue += Number(p.amount);
            return acc;
          }, { total: 0, pending: 0, overdue: 0 });
          setPaymentSummary(summary);
        }
      }

      const { count: reservationsCount } = await supabase
        .from('reservations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'confirmed')
        .gte('start_time', new Date().toISOString());
      
      setUpcomingReservations(reservationsCount || 0);

      const ticketQuery = supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress']);
      
      if (!isAdmin) {
        ticketQuery.eq('user_id', user.id);
      }
      
      const { count: ticketsCount } = await ticketQuery;
      setOpenTickets(ticketsCount || 0);

      setLoading(false);
    };

    fetchDashboardData();
  }, [user, isAdmin]);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <DashboardLayout>
      <motion.div 
        initial="hidden"
        animate="show"
        variants={containerVariants}
        className="space-y-10"
      >
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <motion.div variants={itemVariants}>
            <h1 className="font-display text-4xl font-black tracking-tight text-foreground">
              ¡Hola, {user?.email?.split('@')[0]}! 👋
            </h1>
            <p className="text-muted-foreground mt-2 text-lg font-medium">
              {isAdmin 
                ? 'Panel de gestión administrativa y operativa.' 
                : 'Resumen actual de tu propiedad y comunidad.'}
            </p>
          </motion.div>
          <motion.div variants={itemVariants} className="flex items-center gap-3 bg-card/40 backdrop-blur-xl p-2 rounded-2xl border border-border/50 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div className="pr-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Rol Actual</p>
              <p className="font-bold text-sm">{role === 'super_admin' ? 'Super Admin' : role === 'admin' ? 'Administrador' : 'Residente'}</p>
            </div>
          </motion.div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {!isAdmin && (
            <>
              <motion.div variants={itemVariants}>
                <StatCard
                  title="Saldo Pendiente"
                  value={`$${(paymentSummary.pending + paymentSummary.overdue).toFixed(2)}`}
                  subtitle="Total a pagar este mes"
                  icon={DollarSign}
                  variant={paymentSummary.overdue > 0 ? 'destructive' : paymentSummary.pending > 0 ? 'warning' : 'success'}
                />
              </motion.div>
              <motion.div variants={itemVariants}>
                <StatCard
                  title="Estado Financiero"
                  value={paymentSummary.overdue > 0 ? 'En Mora' : paymentSummary.pending > 0 ? 'Pendiente' : 'Al Día'}
                  subtitle={paymentSummary.overdue > 0 ? 'Atención inmediata' : 'Sin deudas pendientes'}
                  icon={TrendingUp}
                  variant={paymentSummary.overdue > 0 ? 'destructive' : paymentSummary.pending > 0 ? 'warning' : 'success'}
                />
              </motion.div>
            </>
          )}
          <motion.div variants={itemVariants}>
            <StatCard
              title="Reservas"
              value={upcomingReservations}
              subtitle="Espacios reservados"
              icon={Calendar}
              variant="primary"
            />
          </motion.div>
          <motion.div variants={itemVariants}>
            <StatCard
              title="Solicitudes PQR"
              value={openTickets}
              subtitle={isAdmin ? "Total activas" : "Mis solicitudes"}
              icon={MessageSquare}
              variant={openTickets > 0 ? 'warning' : 'success'}
            />
          </motion.div>
          {isAdmin && (
            <motion.div variants={itemVariants}>
              <StatCard
                title="Comunicados"
                value={news.length}
                subtitle="Anuncios en cartelera"
                icon={Newspaper}
                variant="default"
              />
            </motion.div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content: News */}
          <motion.div variants={itemVariants} className="lg:col-span-2 space-y-6">
            <Card className="card-elevated border-none shadow-2xl bg-card/30 backdrop-blur-xl overflow-hidden relative">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Newspaper className="w-32 h-32" />
              </div>
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl font-black flex items-center gap-3">
                  <Newspaper className="w-6 h-6 text-primary" />
                  Cartelera Virtual
                </CardTitle>
                <CardDescription className="text-sm font-bold uppercase tracking-wider">Últimos anuncios de la administración</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {news.length === 0 ? (
                  <div className="text-center py-16">
                    <Newspaper className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-muted-foreground font-medium">No hay anuncios publicados por el momento.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {news.map((item) => (
                      <div
                        key={item.id}
                        className="group flex flex-col sm:flex-row gap-4 p-4 sm:p-5 rounded-2xl bg-background/40 border border-border/50 hover:border-primary/50 hover:bg-background/60 transition-all cursor-pointer shadow-sm"
                        onClick={() => window.location.href='/news'}
                      >
                        {item.image_url ? (
                          <div className="w-full sm:w-20 h-40 sm:h-20 rounded-xl overflow-hidden flex-shrink-0 border border-border/50">
                            <img src={item.image_url} alt={item.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                          </div>
                        ) : (
                          <div className="w-full sm:w-20 h-20 rounded-xl bg-primary/5 flex items-center justify-center flex-shrink-0 border border-border/50">
                            <Newspaper className="w-8 h-8 text-primary/30" />
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex justify-between items-start gap-2">
                            <h3 className="font-black text-lg text-foreground group-hover:text-primary transition-colors leading-tight">{item.title}</h3>
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 bg-muted/50 px-2 py-1 rounded flex-shrink-0">
                              {format(new Date(item.created_at), 'd MMM', { locale: es })}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2 font-medium leading-relaxed">
                            {item.content}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <Button variant="ghost" className="w-full h-12 rounded-xl font-bold gap-2 text-primary hover:bg-primary/5" onClick={() => window.location.href='/news'}>
                  Ver todos los anuncios <ArrowRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* Sidebar: Quick Actions */}
          <motion.div variants={itemVariants} className="space-y-6">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground px-1">Acciones Rápidas</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
              <QuickActionCard 
                icon={QrCode} 
                title="Acceso QR" 
                desc="Mi llave digital" 
                color="bg-primary" 
                href="/access" 
              />
              <QuickActionCard 
                icon={Calendar} 
                title="Reservar Área" 
                desc="Gimnasio, Salón, etc." 
                color="bg-blue-500" 
                href="/reservations" 
              />
              <QuickActionCard 
                icon={CreditCard} 
                title="Pagos y Estado" 
                desc="Ver mis alícuotas" 
                color="bg-emerald-500" 
                href="/payments" 
              />
              <QuickActionCard 
                icon={MessageSquare} 
                title="Centro de PQR" 
                desc="Reportar problemas" 
                color="bg-amber-500" 
                href="/tickets" 
              />
            </div>

            {/* Help Card */}
            <Card className="card-elevated border-none bg-primary text-primary-foreground overflow-hidden relative shadow-xl shadow-primary/20">
              <div className="absolute -right-4 -bottom-4 opacity-10">
                <MessageSquare className="w-24 h-24" />
              </div>
              <CardContent className="p-6">
                <h3 className="font-black text-xl mb-2">¿Necesitas ayuda?</h3>
                <p className="text-sm font-medium opacity-90 mb-4">Nuestro equipo de administración está disponible para resolver tus dudas.</p>
                <Button 
                  variant="secondary" 
                  className="w-full rounded-full font-black shadow-lg"
                  onClick={() => window.location.href='/chat'}
                >
                  Ir al Chat Directo
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </motion.div>
    </DashboardLayout>
  );
};

const QuickActionCard = ({ icon: Icon, title, desc, color, href }: any) => (
  <Card 
    className="card-elevated border-none shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group overflow-hidden bg-card/40 backdrop-blur-sm"
    onClick={() => window.location.href = href}
  >
    <CardContent className="p-4 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-2xl ${color} text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1">
        <h3 className="font-black text-foreground group-hover:text-primary transition-colors leading-tight">{title}</h3>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-0.5">{desc}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
    </CardContent>
  </Card>
);

export default Dashboard;
