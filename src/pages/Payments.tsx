import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { StatCard } from '@/components/ui/StatCard';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CreditCard, DollarSign, AlertCircle, CheckCircle, Clock, Loader2, ArrowRight, History, Receipt, Upload, Eye, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import KushkiCheckout from '@/components/payments/KushkiCheckout';
import { motion } from 'framer-motion';

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
      const list = (data as unknown as Payment[]) || [];
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
      const fileExt = file.name.split('.').pop();
      const fileName = `payment-receipt-${uploadingPaymentId}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        toast.error('Error al subir el comprobante: ' + uploadError.message);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('receipts')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('payments')
        .update({ receipt_url: publicUrl })
        .eq('id', uploadingPaymentId);

      if (updateError) {
        toast.error('Error al asociar el comprobante');
      } else {
        toast.success('Comprobante subido. La administración lo verificará en breve.');
        fetchPayments();
      }
    } catch (err) {
      toast.error('Error inesperado al subir comprobante');
    } finally {
      setIsUploading(false);
      setUploadingPaymentId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getStatusBadge = (status: string, hasReceipt?: boolean) => {
    switch (status) {
      case 'paid':
        return <StatusBadge status="success">Pagado</StatusBadge>;
      case 'pending':
        return hasReceipt ? (
          <StatusBadge status="warning">En Revisión</StatusBadge>
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
        return 'Alícuota Mensual';
      case 'fine':
        return 'Multa';
      case 'other':
        return 'Otro Cargo';
      default:
        return type;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-10 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h1 className="font-display text-4xl font-black flex items-center gap-4 text-foreground tracking-tight">
              <div className="p-3 bg-primary/10 rounded-2xl">
                <CreditCard className="w-8 h-8 text-primary" />
              </div>
              Estado de Cuenta y Pagos
            </h1>
            <p className="text-muted-foreground mt-2 text-lg font-medium">
              Consulta tus cargos pendientes y sube comprobantes de transferencia
            </p>
          </div>
        </div>

        {/* Input oculto para subida de comprobante */}
        <input 
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard
            title="Total Facturado"
            value={`$${summary.total.toFixed(2)}`}
            subtitle="Historial acumulado"
            icon={DollarSign}
            variant="default"
          />
          <StatCard
            title="Total Pagado"
            value={`$${summary.paid.toFixed(2)}`}
            subtitle="Al día con la administración"
            icon={CheckCircle}
            variant="success"
          />
          <StatCard
            title="Por Pagar"
            value={`$${summary.pending.toFixed(2)}`}
            subtitle="Cuota del mes actual"
            icon={Clock}
            variant="warning"
          />
          <StatCard
            title="Vencido"
            value={`$${summary.overdue.toFixed(2)}`}
            subtitle="Pendiente de meses anteriores"
            icon={AlertCircle}
            variant="destructive"
          />
        </div>

        <div className="grid grid-cols-1 gap-8">
          {/* Pending Payments Section */}
          <div className="space-y-6">
            <h2 className="text-xl font-black flex items-center gap-2 px-1 uppercase tracking-wider text-muted-foreground">
              <Receipt className="w-5 h-5" />
              Obligaciones Pendientes
            </h2>
            
            {loading ? (
              <div className="flex items-center justify-center py-20 bg-card/20 rounded-3xl backdrop-blur-sm border border-border/50">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
              </div>
            ) : payments.filter(p => p.status !== 'paid').length === 0 ? (
              <Card className="card-elevated border-none shadow-xl bg-gradient-to-br from-emerald-500/10 to-transparent p-12 text-center overflow-hidden relative">
                <CheckCircle className="w-24 h-24 text-emerald-500/20 absolute -right-4 -bottom-4" />
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-10 h-10 text-emerald-600" />
                </div>
                <h3 className="font-black text-2xl text-emerald-900">¡Estás al día!</h3>
                <p className="text-emerald-700/70 font-medium mt-2">No tienes pagos pendientes ni vencidos en este momento.</p>
              </Card>
            ) : (
              <div className="grid gap-4">
                {payments.filter(p => p.status !== 'paid').map((payment) => (
                  <Card key={payment.id} className="card-elevated border-none shadow-lg hover:shadow-xl transition-all overflow-hidden bg-card/40 backdrop-blur-xl">
                    <div className="flex flex-col md:flex-row items-center p-6 gap-6">
                      <div className={`p-4 rounded-2xl ${payment.status === 'overdue' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}`}>
                        <DollarSign className="w-8 h-8" />
                      </div>
                      <div className="flex-1 text-center md:text-left">
                        <div className="flex flex-col md:flex-row md:items-center gap-2 mb-1">
                          <h3 className="font-black text-xl text-foreground">{payment.description}</h3>
                          {getStatusBadge(payment.status, !!payment.receipt_url)}
                        </div>
                        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                          {getPaymentTypeLabel(payment.payment_type)} • Vence el {format(new Date(payment.due_date), 'd MMM, yyyy', { locale: es })}
                        </p>
                      </div>

                      <div className="flex flex-col items-center md:items-end gap-3">
                        <p className="text-3xl font-black text-primary tracking-tighter">${Number(payment.amount).toFixed(2)}</p>
                        
                        <div className="flex flex-wrap gap-2 justify-center">
                          {payment.receipt_url && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setViewingReceiptUrl(payment.receipt_url || null)}
                              className="rounded-xl font-bold gap-1 text-xs"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Ver Comprobante
                            </Button>
                          )}

                          <Button
                            variant={payment.receipt_url ? 'ghost' : 'outline'}
                            size="sm"
                            disabled={isUploading && uploadingPaymentId === payment.id}
                            onClick={() => handleSelectReceipt(payment.id)}
                            className="rounded-xl font-bold gap-1 text-xs"
                          >
                            {isUploading && uploadingPaymentId === payment.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Upload className="w-3.5 h-3.5" />
                            )}
                            {payment.receipt_url ? 'Cambiar Recibo' : 'Subir Comprobante'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* History Section */}
          <div className="space-y-6">
            <h2 className="text-xl font-black flex items-center gap-2 px-1 uppercase tracking-wider text-muted-foreground">
              <History className="w-5 h-5" />
              Historial de Transacciones
            </h2>
            
            {/* Desktop Table */}
            <Card className="hidden md:block card-elevated border-none shadow-2xl overflow-hidden bg-card/30 backdrop-blur-xl">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/20">
                      <th className="text-left py-5 px-8 text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">Concepto</th>
                      <th className="text-left py-5 px-8 text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">Valor</th>
                      <th className="text-left py-5 px-8 text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">Fecha Pago</th>
                      <th className="text-left py-5 px-8 text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">Estado</th>
                      <th className="text-left py-5 px-8 text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">Recibo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.filter(p => p.status === 'paid').map((payment) => (
                      <tr key={payment.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors group">
                        <td className="py-5 px-8">
                          <p className="font-bold text-foreground group-hover:text-primary transition-colors">{payment.description}</p>
                          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-1">{getPaymentTypeLabel(payment.payment_type)}</p>
                        </td>
                        <td className="py-5 px-8">
                          <p className="font-black text-lg text-foreground tracking-tight">${Number(payment.amount).toFixed(2)}</p>
                        </td>
                        <td className="py-5 px-8">
                          <p className="text-sm font-bold text-muted-foreground">
                            {payment.paid_at ? format(new Date(payment.paid_at), 'd MMM, yyyy', { locale: es }) : '-'}
                          </p>
                        </td>
                        <td className="py-5 px-8">
                          <StatusBadge status="success">Pagado</StatusBadge>
                        </td>
                        <td className="py-5 px-8">
                          {payment.receipt_url ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setViewingReceiptUrl(payment.receipt_url || null)}
                              className="rounded-xl font-bold gap-1 text-xs text-primary hover:bg-primary/10"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Ver
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground/60 italic font-medium">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {payments.filter(p => p.status === 'paid').length === 0 && !loading && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-muted-foreground font-medium italic">No hay transacciones previas registradas.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-4">
              {payments.filter(p => p.status === 'paid').map((payment) => (
                <Card key={payment.id} className="card-elevated border-none shadow-lg bg-card/40 backdrop-blur-xl p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="font-black text-foreground">{payment.description}</h4>
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-1">
                        {getPaymentTypeLabel(payment.payment_type)}
                      </p>
                    </div>
                    <StatusBadge status="success">Pagado</StatusBadge>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Fecha</p>
                      <p className="text-sm font-bold text-foreground">
                        {payment.paid_at ? format(new Date(payment.paid_at), 'd MMM, yyyy', { locale: es }) : '-'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {payment.receipt_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setViewingReceiptUrl(payment.receipt_url || null)}
                          className="rounded-xl font-bold text-xs"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <p className="text-2xl font-black text-primary tracking-tight">
                        ${Number(payment.amount).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>

        {/* Modal de visualización de comprobante */}
        <Dialog open={!!viewingReceiptUrl} onOpenChange={(open) => !open && setViewingReceiptUrl(null)}>
          <DialogContent className="max-w-2xl rounded-2xl p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Comprobante de Pago
              </DialogTitle>
              <DialogDescription>
                Comprobante de transferencia adjunto
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 flex justify-center bg-black/5 dark:bg-black/30 rounded-2xl p-4 overflow-hidden max-h-[70vh]">
              {viewingReceiptUrl?.endsWith('.pdf') ? (
                <iframe src={viewingReceiptUrl} className="w-full h-96 rounded-xl" title="Comprobante PDF" />
              ) : (
                <img 
                  src={viewingReceiptUrl || ''} 
                  alt="Comprobante" 
                  className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-lg" 
                />
              )}
            </div>

            <div className="flex justify-end pt-4">
              <Button variant="outline" onClick={() => setViewingReceiptUrl(null)} className="rounded-xl font-bold">
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
