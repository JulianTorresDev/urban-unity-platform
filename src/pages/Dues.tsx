import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { uploadReceiptResilient, getReceiptUrl } from '@/lib/receiptStorage';
import { StatCard } from '@/components/ui/StatCard';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  DollarSign, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Loader2, 
  Receipt, 
  History, 
  Upload, 
  Eye, 
  FileText, 
  Camera, 
  CheckCircle2,
  HelpCircle,
  ArrowRight,
  Building,
  Copy,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { stagger, fadeUp } from '@/lib/motion';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

interface Due {
  id: string;
  amount: number;
  month: number;
  year: number;
  status: string;
  paid_at: string | null;
  notes: string | null;
  receipt_url?: string | null;
  rejection_reason?: string | null;
}

const containerVariants = stagger;
const itemVariants = fadeUp;

const Dues = () => {
  const { user } = useAuth();
  const [dues, setDues] = useState<Due[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal comprobante
  const [viewingReceiptUrl, setViewingReceiptUrl] = useState<string | null>(null);
  const [uploadingDueId, setUploadingDueId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDues = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('dues')
      .select('*')
      .eq('user_id', user.id)
      .order('year', { ascending: false })
      .order('month', { ascending: false });

    if (error) {
      toast.error('Error al cargar alícuotas');
    } else {
      const list = ((data as unknown as Due[]) || []).map(d => ({
        ...d,
        receipt_url: getReceiptUrl(d.id, d.receipt_url)
      }));
      setDues(list);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDues();

    if (!user) return;
    const channel = supabase.channel('my-dues')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dues', filter: `user_id=eq.${user.id}` }, () => {
        fetchDues();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const handleSelectFile = (dueId: string) => {
    setUploadingDueId(dueId);
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !uploadingDueId) return;

    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      toast.error('Por favor selecciona una foto (JPG, PNG) o un archivo PDF');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no debe pesar más de 5 MB');
      return;
    }

    setIsUploading(true);
    try {
      const res = await uploadReceiptResilient(uploadingDueId, file, 'dues');
      if (res.success) {
        toast.success('Comprobante enviado. La administración lo revisará pronto.');
        fetchDues();
      } else {
        toast.error('No se pudo registrar el comprobante: ' + res.error);
      }
    } catch (err) {
      toast.error('Ocurrió un error inesperado al subir la foto');
    } finally {
      setIsUploading(false);
      setUploadingDueId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado al portapapeles`);
  };

  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  const currentMonthDue = dues.find(d => d.month === currentMonth && d.year === currentYear);
  const firstPendingDue = dues.find(d => d.status === 'pending' || d.status === 'overdue');
  const priorityDue = currentMonthDue || firstPendingDue;

  const summary = dues.reduce((acc, d) => {
    acc.total += Number(d.amount);
    if (d.status === 'paid') acc.paid += Number(d.amount);
    if (d.status === 'pending') acc.pending += Number(d.amount);
    if (d.status === 'overdue') acc.overdue += Number(d.amount);
    return acc;
  }, { total: 0, paid: 0, pending: 0, overdue: 0 });

  return (
    <DashboardLayout>
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-8 max-w-6xl mx-auto pb-16"
      >
        {/* Input oculto para carga de archivos */}
        <input 
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Encabezado Principal */}
        <motion.div variants={itemVariants}>
          <div className="relative">

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary">
                    <Receipt className="w-3.5 h-3.5" />
                    Mi hogar
                  </span>
                </div>
                <h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold text-foreground tracking-tight font-display">
                  Alícuotas
                </h1>
                <p className="text-muted-foreground text-base md:text-lg mt-1">
                  Consulta tus cuotas mensuales y sube el comprobante de cada transferencia.
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* HERO CARD DE ATENCIÓN DE ALÍCUOTA PRIORITARIA (ANIMADA) */}
        {!loading && (
          <motion.div variants={itemVariants}>
            {priorityDue && priorityDue.status !== 'paid' ? (
              <div className="rounded-2xl bg-amber-500/10 border border-amber-500/40 p-6 sm:p-8 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

                <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/20 px-3 py-1 rounded-full border border-amber-500/30">
                        {priorityDue.receipt_url ? 'Comprobante en revisión' : 'Cuota pendiente de pago'}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        {MONTHS[priorityDue.month - 1]} {priorityDue.year}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-3">
                      <span className="text-4xl sm:text-5xl font-semibold text-foreground font-display tabular-nums">
                        ${Number(priorityDue.amount).toFixed(2)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        Cuota de mantenimiento
                      </span>
                    </div>

                    <p className="text-muted-foreground text-sm max-w-xl">
                      {priorityDue.receipt_url 
                        ? 'Tu comprobante de pago fue enviado con éxito. La administración lo validará en breve.' 
                        : 'Por favor realiza la transferencia a la cuenta del conjunto y sube una foto nítida de tu comprobante.'}
                    </p>

                    {priorityDue.rejection_reason && (
                      <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-700 dark:text-rose-400 mt-2">
                        Motivo de observación anterior: {priorityDue.rejection_reason}
                      </div>
                    )}
                  </div>

                  {/* Botón Gigante Accesible */}
                  <div className="w-full lg:w-auto flex-shrink-0">
                    {priorityDue.receipt_url ? (
                      <div className="flex flex-col sm:flex-row gap-3">
                        <motion.div>
                          <Button
                            variant="outline"
                            size="lg"
                            onClick={() => setViewingReceiptUrl(priorityDue.receipt_url || null)}
                            className="h-16 px-6 rounded-2xl font-semibold text-base gap-2.5 border border-primary/40 text-primary hover:bg-primary/10 shadow-sm"
                          >
                            <Eye className="w-5 h-5" />
                            Ver mi comprobante
                          </Button>
                        </motion.div>

                        <motion.div>
                          <Button
                            size="lg"
                            disabled={isUploading && uploadingDueId === priorityDue.id}
                            onClick={() => handleSelectFile(priorityDue.id)}
                            className="h-16 px-6 rounded-2xl font-semibold text-base gap-2.5 bg-muted text-foreground hover:bg-muted/80 shadow-sm"
                          >
                            {isUploading && uploadingDueId === priorityDue.id ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <Upload className="w-5 h-5" />
                            )}
                            Cambiar foto
                          </Button>
                        </motion.div>
                      </div>
                    ) : (
                      <motion.div>
                        <Button
                          size="lg"
                          disabled={isUploading && uploadingDueId === priorityDue.id}
                          onClick={() => handleSelectFile(priorityDue.id)}
                          className="w-full lg:w-80 h-16 rounded-2xl font-semibold text-lg gap-3 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl transition-[color,background-color,border-color,box-shadow,opacity,transform]"
                        >
                          {isUploading && uploadingDueId === priorityDue.id ? (
                            <>
                              <Loader2 className="w-6 h-6 animate-spin" />
                              <span>Subiendo foto...</span>
                            </>
                          ) : (
                            <>
                              <Camera className="w-6 h-6" />
                              <span>Subir foto de comprobante</span>
                            </>
                          )}
                        </Button>
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-6 sm:p-8 shadow-sm">
                <div className="flex items-center gap-5">
                  <div className="flex items-center justify-center flex-shrink-0 text-muted-foreground">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-semibold text-emerald-950 dark:text-emerald-300 font-display">
                      Estás al día
                    </h2>
                    <p className="text-emerald-800/80 dark:text-emerald-400/80 text-base font-semibold mt-0.5">
                      No tienes cuotas pendientes ni vencidas con la administración del conjunto.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Métricas Resumidas con Micro-animación */}
        <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total acumulado" value={summary.total} format={(n) => `$${n.toFixed(2)}`} icon={DollarSign} variant="default" />
          <StatCard title="Cuotas pagadas" value={summary.paid} format={(n) => `$${n.toFixed(2)}`} icon={CheckCircle2} variant="success" />
          <StatCard title="Por pagar" value={summary.pending} format={(n) => `$${n.toFixed(2)}`} icon={Clock} variant="warning" />
          <StatCard title="Vencidas" value={summary.overdue} format={(n) => `$${n.toFixed(2)}`} icon={AlertCircle} variant="destructive" />
        </motion.div>

        {/* Tarjeta de Información Bancaria para Facilitar el Depósito */}
        <motion.div variants={itemVariants}>
          <div className="rounded-2xl bg-card/90 backdrop-blur-xl p-6 md:p-8 space-y-4 shadow-hairline">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center text-muted-foreground">
                <Building className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground font-display">
                  Datos para la transferencia
                </h3>
                <p className="text-xs text-muted-foreground font-medium">
                  Transfiere desde tu banca móvil y toma una captura de pantalla para subirla aquí
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-muted/40 p-4 rounded-2xl border border-border/60">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Institución financiera</p>
                <p className="text-base font-semibold text-foreground mt-0.5">Banco Pichincha</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Tipo de cuenta</p>
                <p className="text-base font-semibold text-foreground mt-0.5">Cuenta corriente</p>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Número de cuenta</p>
                  <p className="text-base font-mono font-semibold text-foreground mt-0.5">2100874523</p>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => copyToClipboard('2100874523', 'Número de cuenta')}
                  aria-label="Copiar número de cuenta"
                  className="h-9 w-9 rounded-xl text-primary hover:bg-primary/10"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Beneficiario / RUC</p>
                <p className="text-base font-semibold text-foreground mt-0.5">Conjunto Gissel's 2</p>
                <p className="text-xs text-muted-foreground font-medium">RUC: 1792345678001</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Historial Completo de Mensualidades */}
        <motion.div variants={itemVariants} className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xl font-semibold flex items-center gap-2.5 text-foreground font-display">
              <History className="w-5 h-5 text-primary" />
              Historial
            </h3>
            <span className="text-xs font-medium text-muted-foreground">
              {dues.length} cuotas registradas
            </span>
          </div>

          <div className="rounded-2xl bg-card/90 backdrop-blur-xl overflow-hidden shadow-hairline">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-10 h-10 animate-spin text-primary mb-3" />
                <p className="text-sm text-muted-foreground">Cargando tus cuotas...</p>
              </div>
            ) : dues.length === 0 ? (
              <div className="p-12 text-center">
                <Receipt className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <h4 className="font-semibold text-lg text-foreground">Aún no hay alícuotas registradas</h4>
                <p className="text-sm text-muted-foreground font-medium mt-1">Tus cuotas mensuales aparecerán en esta lista.</p>
              </div>
            ) : (
              <div className="divide-y-2 divide-border/60">
                {dues.map((due) => {
                  const isPaid = due.status === 'paid';
                  const hasReceipt = !!due.receipt_url;

                  return (
                    <div 
                      key={due.id} 
                      className="p-5 sm:p-6 hover:bg-muted/20 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <h4 className="font-semibold text-xl text-foreground font-display">
                            {MONTHS[due.month - 1]} {due.year}
                          </h4>
                          {isPaid ? (
                            <StatusBadge status="success">Pagada</StatusBadge>
                          ) : hasReceipt ? (
                            <StatusBadge status="warning">En revisión</StatusBadge>
                          ) : due.status === 'overdue' ? (
                            <StatusBadge status="destructive">Vencida</StatusBadge>
                          ) : (
                            <StatusBadge status="warning">Pendiente</StatusBadge>
                          )}
                        </div>

                        <p className="text-xs sm:text-sm text-muted-foreground font-medium">
                          {isPaid && due.paid_at ? (
                            `Pagado el ${new Date(due.paid_at).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' })}`
                          ) : hasReceipt ? (
                            'Comprobante adjunto esperando confirmación'
                          ) : (
                            'Pendiente de comprobante'
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-border/50">
                        <p className="text-2xl font-semibold text-foreground tabular-nums font-display">
                          ${Number(due.amount).toFixed(2)}
                        </p>

                        <div className="flex gap-2">
                          {hasReceipt && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setViewingReceiptUrl(due.receipt_url || null)}
                              className="h-10 px-3.5 rounded-xl text-xs font-semibold gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
                            >
                              <Eye className="w-4 h-4" />
                              Ver foto
                            </Button>
                          )}

                          {!isPaid && (
                            <Button
                              size="sm"
                              disabled={isUploading && uploadingDueId === due.id}
                              onClick={() => handleSelectFile(due.id)}
                              className="h-10 px-4 rounded-xl text-xs font-semibold gap-1.5 shadow-sm"
                            >
                              {isUploading && uploadingDueId === due.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Upload className="w-3.5 h-3.5" />
                              )}
                              {hasReceipt ? 'Cambiar foto' : 'Subir foto'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>

        {/* Modal Accesible de Comprobante */}
        <Dialog open={!!viewingReceiptUrl} onOpenChange={(open) => !open && setViewingReceiptUrl(null)}>
          <DialogContent className="max-w-2xl rounded-2xl p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-semibold text-foreground">
                <FileText className="w-5 h-5 text-primary" />
                Comprobante de pago subido
              </DialogTitle>
              <DialogDescription className="font-semibold">
                Captura de pantalla o documento del depósito bancario
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 flex justify-center bg-black/5 dark:bg-black/40 rounded-2xl p-4 overflow-hidden max-h-[70vh]">
              {viewingReceiptUrl?.endsWith('.pdf') ? (
                <iframe src={viewingReceiptUrl} className="w-full h-96 rounded-xl" title="Comprobante PDF" />
              ) : (
                <img 
                  src={viewingReceiptUrl || ''} 
                  alt="Foto del Comprobante" 
                  className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-lg" 
                />
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-border/60">
              <Button 
                variant="outline" 
                onClick={() => setViewingReceiptUrl(null)} 
                className="h-11 px-6 rounded-xl font-semibold"
              >
                Cerrar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>
    </DashboardLayout>
  );
};

export default Dues;
