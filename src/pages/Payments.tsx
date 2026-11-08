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
  CreditCard, 
  DollarSign, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Loader2, 
  ArrowRight, 
  History, 
  Receipt, 
  Upload, 
  Eye, 
  FileText,
  Building,
  Copy,
  Info
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

interface Payment {
  id: string;
  description: string;
  amount: number;
  due_date: string;
  paid_at: string | null;
  payment_type: string;
  status: string;
  receipt_url?: string | null;
  rejection_reason?: string | null;
  created_at: string;
}

const Payments = () => {
  const { user } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ total: 0, paid: 0, pending: 0, overdue: 0 });

  // Receipt upload & preview state
  const [uploadingPaymentId, setUploadingPaymentId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [viewingReceiptUrl, setViewingReceiptUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPayments = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('user_id', user.id)
      .order('due_date', { ascending: false });

    if (error) {
      toast.error('Error al cargar pagos');
    } else {
      const list = ((data as unknown as Payment[]) || []).map(p => ({
        ...p,
        receipt_url: getReceiptUrl(p.id, p.receipt_url)
      }));
      setPayments(list);
      
      const sum = list.reduce((acc, p) => {
        acc.total += Number(p.amount);
        if (p.status === 'paid') acc.paid += Number(p.amount);
        if (p.status === 'pending') acc.pending += Number(p.amount);
        if (p.status === 'overdue') acc.overdue += Number(p.amount);
        return acc;
      }, { total: 0, paid: 0, pending: 0, overdue: 0 });
      setSummary(sum);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPayments();

    if (!user) return;
    const channel = supabase.channel('my-payments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `user_id=eq.${user.id}` }, () => {
        fetchPayments();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const handleSelectReceipt = (paymentId: string) => {
    setUploadingPaymentId(paymentId);
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !uploadingPaymentId) return;

    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      toast.error('Por favor selecciona una imagen o documento PDF');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('El archivo no debe superar los 5 MB');
      return;
    }

    setIsUploading(true);
    try {
      const res = await uploadReceiptResilient(uploadingPaymentId, file, 'payments');
      if (res.success) {
        toast.success('Comprobante enviado. La administración lo revisará pronto.');
        fetchPayments();
      } else {
        toast.error('No se pudo registrar el comprobante: ' + res.error);
      }
    } catch (err) {
      toast.error('Error inesperado al subir comprobante');
    } finally {
      setIsUploading(false);
      setUploadingPaymentId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado al portapapeles`);
  };

  const getStatusBadge = (status: string, hasReceipt?: boolean) => {
    switch (status) {
      case 'paid':
        return <StatusBadge status="success">Pagado</StatusBadge>;
      case 'pending':
        return hasReceipt ? (
          <StatusBadge status="warning">En revisión</StatusBadge>
        ) : (
          <StatusBadge status="warning">Pendiente</StatusBadge>
        );
      case 'overdue':
        return <StatusBadge status="destructive">Vencido</StatusBadge>;
      default:
        return <StatusBadge status="muted">{status}</StatusBadge>;
    }
  };

  const getPaymentTypeLabel = (type: string) => {
    switch (type) {
      case 'monthly_dues':
        return 'Alícuota mensual';
      case 'fine':
        return 'Multa / sanción';
      case 'other':
        return 'Servicio adicional';
      default:
        return type;
    }
  };

  const pendingPayments = payments.filter(p => p.status !== 'paid');
  const paidPayments = payments.filter(p => p.status === 'paid');

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-6xl mx-auto pb-16">
        {/* Encabezado Principal */}
        <div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary">
                  Mi hogar
                </span>
              </div>
              <h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold text-foreground tracking-tight flex items-center gap-3">
                <CreditCard className="w-9 h-9 text-primary" />
                Pagos
              </h1>
              <p className="text-muted-foreground text-base md:text-lg font-medium mt-1">
                Consulta tus obligaciones del conjunto y sube tus comprobantes de depósito o transferencia.
              </p>
            </div>
          </div>
        </div>

        {/* Input oculto para subir comprobante */}
        <input 
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Resumen Financiero en Tarjetas de Alto Contraste */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <StatCard
            title="Total Facturado"
            value={`$${summary.total.toFixed(2)}`}
            subtitle="Cargos registrados"
            icon={DollarSign}
            variant="default"
          />
          <StatCard
            title="Total Pagado"
            value={`$${summary.paid.toFixed(2)}`}
            subtitle="Pagos aprobados"
            icon={CheckCircle2}
            variant="success"
          />
          <StatCard
            title="Por pagar"
            value={`$${summary.pending.toFixed(2)}`}
            subtitle="Pendiente actual"
            icon={Clock}
            variant="warning"
          />
          <StatCard
            title="Vencido"
            value={`$${summary.overdue.toFixed(2)}`}
            subtitle="Meses anteriores"
            icon={AlertCircle}
            variant="destructive"
          />
        </div>

        {/* SECCIÓN 1: Obligaciones Pendientes (Atención Prioritaria para el Residente) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary" />
              Obligaciones por pagar
            </h2>
            {pendingPayments.length > 0 && (
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30">
                {pendingPayments.length} pendiente(s)
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 bg-card rounded-2xl shadow-hairline">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
          ) : pendingPayments.length === 0 ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-8 text-center space-y-3">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h3 className="text-2xl font-semibold text-emerald-900 dark:text-emerald-300">
                ¡Felicidades! No tienes pagos pendientes
              </h3>
              <p className="text-emerald-800/80 dark:text-emerald-300/80 text-base font-medium max-w-md mx-auto">
                Tu cuenta se encuentra totalmente al día con la administración del conjunto residencial.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {pendingPayments.map((payment) => (
                <div 
                  key={payment.id} 
                  className="bg-card rounded-2xl p-6 transition-[color,background-color,border-color,box-shadow,opacity,transform] flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-hairline"
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 mt-1 ${
                      payment.status === 'overdue' ? 'bg-rose-500/10 text-rose-600' : 'bg-amber-500/10 text-amber-600'
                    }`}>
                      <DollarSign className="w-8 h-8" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-0.5 rounded-md">
                          {getPaymentTypeLabel(payment.payment_type)}
                        </span>
                        {getStatusBadge(payment.status, !!payment.receipt_url)}
                      </div>
                      <h3 className="text-xl font-semibold text-foreground">{payment.description}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Fecha límite: {format(new Date(payment.due_date), "d 'de' MMMM, yyyy", { locale: es })}
                      </p>

                      {payment.rejection_reason && (
                        <div className="mt-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-700 dark:text-rose-400">
                          Motivo de rechazo previo: {payment.rejection_reason}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Acciones de Pago y Subida */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-4 md:pt-0 border-border/60">
                    <div className="text-left md:text-right">
                      <p className="text-xs font-medium text-muted-foreground">Monto</p>
                      <p className="text-3xl font-semibold text-foreground tracking-tight">
                        ${Number(payment.amount).toFixed(2)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                      {payment.receipt_url && (
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={() => setViewingReceiptUrl(payment.receipt_url || null)}
                          className="h-12 px-4 rounded-xl font-semibold gap-2 text-primary border-primary/40 hover:bg-primary/10"
                        >
                          <Eye className="w-4 h-4" />
                          <span>Ver foto</span>
                        </Button>
                      )}

                      <Button
                        size="lg"
                        disabled={isUploading && uploadingPaymentId === payment.id}
                        onClick={() => handleSelectReceipt(payment.id)}
                        className={`h-12 px-6 rounded-xl font-semibold gap-2 shadow-sm text-sm active:scale-95 transition-[color,background-color,border-color,box-shadow,opacity,transform] ${
                          payment.receipt_url 
                            ? 'bg-muted text-foreground hover:bg-muted/80' 
                            : 'bg-primary text-primary-foreground'
                        }`}
                      >
                        {isUploading && uploadingPaymentId === payment.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Subiendo...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4" />
                            <span>{payment.receipt_url ? 'Cambiar foto' : 'Subir foto de comprobante'}</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tarjeta de Información Bancaria para Adultos Mayores */}
        <div className="bg-card rounded-2xl p-6 shadow-hairline">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center text-muted-foreground">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Datos para la transferencia
              </h3>
              <p className="text-xs text-muted-foreground font-medium">
                Realiza tu pago en la cuenta oficial del conjunto residencial y luego sube la foto aquí
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-muted/40 p-4 rounded-xl border border-border/60">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Banco</p>
              <p className="text-base font-semibold text-foreground">Banco Pichincha</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Tipo de cuenta</p>
              <p className="text-base font-semibold text-foreground">Corriente</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Número de cuenta</p>
                <p className="text-base font-mono font-semibold text-foreground">2100874523</p>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => copyToClipboard('2100874523', 'Número de cuenta')}
                aria-label="Copiar número de cuenta"
                className="h-8 w-8 rounded-lg text-primary hover:bg-primary/10"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Beneficiario / RUC</p>
              <p className="text-base font-semibold text-foreground">Conjunto Gissel's 2</p>
              <p className="text-xs text-muted-foreground">RUC: 1792345678001</p>
            </div>
          </div>
        </div>

        {/* SECCIÓN 2: Historial de Transacciones Aprobadas */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Pagos verificados
          </h2>

          <div className="bg-card rounded-2xl overflow-hidden shadow-hairline">
            {paidPayments.length === 0 ? (
              <p className="text-center py-12 text-muted-foreground font-medium">
                No hay pagos históricos registrados aún.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/80 bg-muted/40">
                      <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground">Concepto</th>
                      <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground">Monto</th>
                      <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground">Fecha de pago</th>
                      <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground">Estado</th>
                      <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground">Comprobante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paidPayments.map((payment) => (
                      <tr key={payment.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-4 px-6">
                          <p className="font-semibold text-foreground">{payment.description}</p>
                          <p className="text-xs text-muted-foreground font-medium">
                            {getPaymentTypeLabel(payment.payment_type)}
                          </p>
                        </td>
                        <td className="py-4 px-6 font-semibold text-lg text-foreground">
                          ${Number(payment.amount).toFixed(2)}
                        </td>
                        <td className="py-4 px-6 text-sm text-muted-foreground">
                          {payment.paid_at ? format(new Date(payment.paid_at), "d 'de' MMMM, yyyy", { locale: es }) : '-'}
                        </td>
                        <td className="py-4 px-6">
                          <StatusBadge status="success">Pagado</StatusBadge>
                        </td>
                        <td className="py-4 px-6">
                          {payment.receipt_url ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setViewingReceiptUrl(payment.receipt_url || null)}
                              className="rounded-xl font-semibold gap-1.5 text-xs text-primary hover:bg-primary/10"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Ver foto
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground/60 italic font-medium">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Modal Accesible de Visualización de Comprobante */}
        <Dialog open={!!viewingReceiptUrl} onOpenChange={(open) => !open && setViewingReceiptUrl(null)}>
          <DialogContent className="max-w-2xl rounded-2xl p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
                <FileText className="w-5 h-5 text-primary" />
                Comprobante de pago subido
              </DialogTitle>
              <DialogDescription>
                Comprobante de transferencia o depósito registrado en el sistema
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 flex justify-center bg-black/5 dark:bg-black/30 rounded-2xl p-4 overflow-hidden max-h-[70vh]">
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
                className="rounded-xl font-semibold h-11 px-6"
              >
                Cerrar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Payments;
