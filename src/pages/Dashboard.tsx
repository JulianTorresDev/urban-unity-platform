import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  QrCode,
  Upload,
  ChevronRight,
  Copy,
  Check,
  Maximize2,
  UtensilsCrossed,
  Users,
  MessageSquare,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AnimatePresence, motion } from 'framer-motion';
import { stagger, fadeUp, iconSwap } from '@/lib/motion';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@/lib/utils';
import { CountUp } from '@/components/motion/CountUp';

interface NewsItem {
  id: string;
  title: string;
  content: string;
  created_at: string;
  image_url?: string | null;
}

interface CurrentDue {
  id: string;
  amount: number;
  month: number;
  year: number;
  status: string;
  receipt_url?: string | null;
  rejection_reason?: string | null;
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const BANK_ACCOUNT = '2100874523';

const AMENITIES = [
  { icon: Users, name: 'Salón social', detail: 'Hasta 80 personas · Cocina equipada' },
  { icon: UtensilsCrossed, name: 'Zona BBQ y pérgola', detail: 'Parrillas y mobiliario exterior' },
];

const containerVariants = stagger;
const itemVariants = fadeUp;

const SectionHeader = ({ title, to, action }: { title: string; to: string; action: string }) => (
  <div className="flex items-baseline justify-between mb-3 px-1">
    <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
    <Link to={to} className="text-sm text-primary hover:underline underline-offset-4">
      {action}
    </Link>
  </div>
);

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [currentDue, setCurrentDue] = useState<CurrentDue | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<{ full_name: string | null; apartment_number: string | null; status?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Los administradores tienen su propio resumen
  useEffect(() => {
    if (isAdmin) {
      navigate('/admin');
    }
  }, [isAdmin, navigate]);

  useEffect(() => {
    const fetchPortalData = async () => {
      if (!user) return;
      setLoading(true);

      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();

      // Perfil del residente
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, apartment_number, status')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) setUserProfile(profile);

      // Token QR para la llave digital
      const { data: tokenData } = await supabase
        .from('access_tokens')
        .select('token')
        .eq('user_id', user.id)
        .eq('type', 'permanent')
        .maybeSingle();

      if (tokenData) setQrToken(tokenData.token);

      // Alícuota del mes
      const { data: dueData } = await supabase
        .from('dues')
        .select('*')
        .eq('user_id', user.id)
        .eq('month', currentMonth)
        .eq('year', currentYear)
        .maybeSingle();

      if (dueData) {
        setCurrentDue(dueData as CurrentDue);
      } else {
        const { data: lastPending } = await supabase
          .from('dues')
          .select('*')
          .eq('user_id', user.id)
          .neq('status', 'paid')
          .order('year', { ascending: false })
          .order('month', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastPending) setCurrentDue(lastPending as CurrentDue);
      }

      // Comunicados recientes
      const { data: newsData } = await supabase
        .from('news')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);

      if (newsData) setNews(newsData);

      setLoading(false);
    };

    fetchPortalData();
  }, [user]);

  const [copied, setCopied] = useState(false);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const residentName = userProfile?.full_name || user?.email?.split('@')[0] || 'Residente';
  const firstName = residentName.split(' ')[0];
  const aptLabel = userProfile?.apartment_number ? `Departamento ${userProfile.apartment_number}` : 'Residente';
  const isPaid = currentDue?.status === 'paid';
  const hasReceipt = Boolean(currentDue?.receipt_url);
  const isClear = !loading && (!currentDue || isPaid);

  const status = isClear
    ? { tone: 'success' as const, label: isPaid ? 'Pagada' : 'Al día' }
    : hasReceipt
    ? { tone: 'warning' as const, label: 'En revisión' }
    : { tone: 'destructive' as const, label: 'Pendiente' };

  const statusLine = loading
    ? 'Cargando tu resumen…'
    : isClear
    ? 'Estás al día con tus alícuotas.'
    : hasReceipt
    ? 'Recibimos tu comprobante. La administración lo está revisando.'
    : 'Tienes una alícuota pendiente de pago.';

  const amount = currentDue ? Number(currentDue.amount) : 0;
  const cents = amount.toFixed(2).split('.')[1];

  // 0 = emitida, 1 = comprobante, 2 = aprobada
  const steps = [
    { label: 'Emitida', detail: 'Cargo del mes generado', done: Boolean(currentDue) },
    { label: 'Comprobante', detail: hasReceipt || isPaid ? 'Recibido' : 'Pendiente de envío', done: hasReceipt || isPaid },
    { label: 'Aprobada', detail: isPaid ? 'Pago verificado' : 'Revisión de administración', done: isPaid },
  ];
  const currentStep = steps.findIndex((s) => !s.done);

  return (
    <DashboardLayout>
      <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-10">
        {/* Saludo */}
        <motion.header variants={itemVariants}>
          <p className="eyebrow">{aptLabel}</p>
          <h1 className="mt-1 text-[28px] sm:text-[32px] leading-tight font-semibold tracking-tight">
            Hola, {firstName}
          </h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">{statusLine}</p>
        </motion.header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Estado de cuenta */}
          <motion.section variants={itemVariants} className="lg:col-span-2 surface overflow-hidden" aria-labelledby="due-title">
            <div className="p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p id="due-title" className="text-sm text-muted-foreground">
                    {currentDue ? `Alícuota de ${MONTHS[currentDue.month - 1].toLowerCase()} ${currentDue.year}` : 'Alícuota del mes'}
                  </p>
                  <p className="mt-2 font-semibold tracking-tight tabular-nums leading-none">
                    <span className="text-[44px]">{loading ? '—' : <CountUp value={amount} format={(n) => `$${Math.floor(n)}`} />}</span>
                    {!loading && <span className="text-2xl text-muted-foreground">.{cents}</span>}
                  </p>
                </div>
                {!loading && <StatusBadge status={status.tone}>{status.label}</StatusBadge>}
              </div>

              {currentDue?.rejection_reason && !isPaid && !hasReceipt && (
                <p className="mt-5 text-sm text-destructive bg-destructive/[0.06] rounded-lg px-3.5 py-2.5">
                  Comprobante rechazado: {currentDue.rejection_reason}
                </p>
              )}

              {currentDue && (
                <ol className="mt-8 grid grid-cols-3 gap-3" aria-label="Progreso del pago">
                  {steps.map((step, i) => (
                    <li key={step.label} aria-current={i === currentStep ? 'step' : undefined}>
                      <div
                        className={cn(
                          'h-1 rounded-full',
                          step.done ? 'bg-success' : i === currentStep ? 'bg-primary' : 'bg-muted'
                        )}
                      />
                      <p className={cn('mt-3 text-sm font-medium', !step.done && i !== currentStep && 'text-muted-foreground')}>
                        {step.label}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{step.detail}</p>
                    </li>
                  ))}
                </ol>
              )}

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                {isClear ? (
                  <Button asChild size="lg">
                    <Link to="/access">
                      <QrCode />
                      Ver mi acceso QR
                    </Link>
                  </Button>
                ) : (
                  <Button asChild size="lg">
                    <Link to="/dues">
                      <Upload />
                      {hasReceipt ? 'Reemplazar comprobante' : 'Subir comprobante'}
                    </Link>
                  </Button>
                )}
                <Button asChild size="lg" variant="outline">
                  <Link to="/dues">Ver historial</Link>
                </Button>
              </div>
            </div>

            {/* Datos de transferencia */}
            <div className="border-t border-border/70 bg-muted/40 px-6 sm:px-8 py-5">
              <p className="text-sm font-medium">Datos para la transferencia</p>
              <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Banco</dt>
                  <dd className="mt-0.5">Pichincha</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Cuenta corriente</dt>
                  <dd className="mt-0.5">
                    <button
                      onClick={() => copyToClipboard(BANK_ACCOUNT, 'Número de cuenta')}
                      className="relative inline-flex items-center gap-1.5 tabular-nums hover:text-primary transition-colors duration-quick ease-out after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']"
                      aria-label={`Copiar número de cuenta ${BANK_ACCOUNT}`}
                    >
                      {BANK_ACCOUNT}
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.span key={copied ? 'check' : 'copy'} className="flex" {...iconSwap}>
                          {copied ? (
                            <Check className="w-3.5 h-3.5 text-success" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </motion.span>
                      </AnimatePresence>
                    </button>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">RUC</dt>
                  <dd className="mt-0.5 tabular-nums">1792345678001</dd>
                </div>
              </dl>
            </div>
          </motion.section>

          {/* Llave digital */}
          <motion.section variants={itemVariants} className="surface p-6" aria-labelledby="qr-title">
            <div className="flex items-center justify-between">
              <h2 id="qr-title" className="text-[15px] font-semibold tracking-tight">Acceso a la garita</h2>
              {qrToken && <StatusBadge status="success">Activo</StatusBadge>}
            </div>

            <div className="mt-6 flex justify-center">
              <div className={cn('p-3 rounded-xl border border-border/70', qrToken ? 'bg-white' : 'bg-muted/60')}>
                {qrToken ? (
                  <QRCodeSVG
                    value={JSON.stringify({ t: qrToken, u: user?.id, a: userProfile?.apartment_number })}
                    size={156}
                    level="H"
                  />
                ) : (
                  <div className="w-[156px] h-[156px] flex items-center justify-center text-center text-sm text-muted-foreground px-4">
                    {loading ? 'Cargando…' : 'Aún no tienes un código asignado'}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 text-center">
              <p className="text-[15px] font-medium">{residentName}</p>
              <p className="text-sm text-muted-foreground">{aptLabel}</p>
            </div>

            <p className="mt-4 text-sm text-muted-foreground text-center leading-relaxed">
              Muestra este código al guardia para abrir la talanquera.
            </p>

            <Button asChild variant="outline" className="mt-5 w-full">
              <Link to="/access">
                <Maximize2 />
                Pantalla completa
              </Link>
            </Button>
          </motion.section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Comunicados */}
          <motion.section variants={itemVariants} className="lg:col-span-2">
            <SectionHeader title="Comunicados" to="/news" action="Ver todos" />
            <div className="surface divide-y divide-border/70 overflow-hidden">
              {news.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted-foreground text-center">
                  {loading ? 'Cargando…' : 'No hay comunicados recientes.'}
                </p>
              ) : (
                news.map((item) => {
                  const date = new Date(item.created_at);
                  return (
                    <Link
                      key={item.id}
                      to="/news"
                      className="group flex items-start gap-4 px-5 py-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="w-11 flex-shrink-0 text-center pt-0.5">
                        <p className="text-xs text-muted-foreground">{format(date, 'MMM', { locale: es })}</p>
                        <p className="text-xl font-semibold leading-none tabular-nums">{format(date, 'd')}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-medium truncate">{item.title}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2 leading-relaxed">{item.content}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 mt-1 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors flex-shrink-0" />
                    </Link>
                  );
                })
              )}
            </div>
          </motion.section>

          {/* Áreas comunes y ayuda */}
          <motion.section variants={itemVariants}>
            <SectionHeader title="Áreas comunes" to="/reservations" action="Reservar" />
            <div className="surface divide-y divide-border/70 overflow-hidden">
              {AMENITIES.map(({ icon: Icon, name, detail }) => (
                <Link
                  key={name}
                  to="/reservations"
                  className="group flex items-center gap-4 px-5 py-4 hover:bg-muted/50 transition-colors"
                >
                  <Icon className="w-5 h-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium">{name}</p>
                    <p className="text-sm text-muted-foreground">{detail}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                </Link>
              ))}
            </div>

            <Link
              to="/tickets"
              className="mt-4 flex items-center gap-3 rounded-2xl px-5 py-4 text-sm hover:bg-card transition-colors"
            >
              <MessageSquare className="w-5 h-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
              <span className="flex-1">
                <span className="font-medium">¿Dudas con tu pago?</span>{' '}
                <span className="text-muted-foreground">Escribe a la administración.</span>
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
            </Link>
          </motion.section>
        </div>
      </motion.div>
    </DashboardLayout>
  );
};

export default Dashboard;
