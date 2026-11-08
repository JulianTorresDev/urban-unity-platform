import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CreditCard, Plus, Loader2, CheckCircle2, Eye, XCircle, Check, FileText, RefreshCw, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { getReceiptUrl, clearLocalReceipt } from '@/lib/receiptStorage';
import { approvalUpdate, rejectionUpdate } from '@/lib/receiptReview';

interface Payment {
  id: string;
  user_id: string;
  description: string;
  amount: number;
  due_date: string;
  paid_at: string | null;
  payment_type: string;
  status: string;
  receipt_url?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  profiles?: {
    full_name: string | null;
    email: string;
    apartment_number: string | null;
  };
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  apartment_number: string | null;
}

const ManagePayments = () => {
  const { isAdmin } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Modal comprobante
  const [viewingReceiptPayment, setViewingReceiptPayment] = useState<Payment | null>(null);
  
  // Form state
  const [selectedUser, setSelectedUser] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paymentType, setPaymentType] = useState('');

  const fetchData = async () => {
    setLoading(true);
    const [paymentsRes, profilesRes] = await Promise.all([
      supabase.from('payments').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email, apartment_number'),
    ]);

    if (profilesRes.data) setProfiles(profilesRes.data);
    
    if (paymentsRes.data && profilesRes.data) {
      const profilesMap = new Map(profilesRes.data.map(p => [p.id, p]));
      const paymentsWithProfiles = paymentsRes.data.map(p => ({
        ...p,
        receipt_url: getReceiptUrl(p.id, p.receipt_url),
        profiles: profilesMap.get(p.user_id),
      }));
      setPayments(paymentsWithProfiles as unknown as Payment[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) {
      fetchData();

      const channel = supabase.channel('manage-payments-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
          fetchData();
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [isAdmin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedUser || !description.trim() || !amount || !dueDate || !paymentType) {
      toast.error('Por favor completa todos los campos requeridos');
      return;
    }
    if (!(parseFloat(amount) > 0)) {
      toast.error('El monto debe ser mayor que cero');
      return;
    }

    setIsSubmitting(true);

    const { error } = await supabase.from('payments').insert({
      user_id: selectedUser,
      description,
      amount: parseFloat(amount),
      due_date: dueDate,
      payment_type: paymentType,
    });

    if (error) {
      toast.error('Error al crear el pago: ' + error.message);
    } else {
      toast.success('Registro de cargo creado con éxito');
      fetchData();
      setIsDialogOpen(false);
      resetForm();
    }

    setIsSubmitting(false);
  };

  // APROBAR PAGO EN 1-CLICK
  const handleMarkPaid = async (payment: Payment) => {
    setActionLoadingId(payment.id);
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('payments')
      .update(approvalUpdate(new Date(now)))
      .eq('id', payment.id);

    if (error) {
      toast.error('Error al actualizar el pago: ' + error.message);
    } else {
      toast.success('Pago aprobado.');

      // Notificar al residente
      try {
        await supabase.from('notifications').insert({
          user_id: payment.user_id,
          title: 'Pago verificado y aprobado',
          message: `Tu comprobante de "${payment.description}" por $${Number(payment.amount).toFixed(2)} ha sido verificado con éxito.`,
          type: 'success',
          link: '/payments',
        });
      } catch (e) {
        console.warn(e);
      }

      if (viewingReceiptPayment?.id === payment.id) setViewingReceiptPayment(null);
      fetchData();
    }
    setActionLoadingId(null);
  };

  // RECHAZAR COMPROBANTE EN 1-CLICK
  const handleRejectPayment = async (payment: Payment) => {
    setActionLoadingId(payment.id);
    clearLocalReceipt(payment.id);

    const { error } = await supabase
      .from('payments')
      .update(rejectionUpdate())
      .eq('id', payment.id);

    if (error) {
      toast.error('Error al rechazar el comprobante');
    } else {
      toast.warning('Comprobante rechazado. Se notificó al residente.');

      try {
        await supabase.from('notifications').insert({
          user_id: payment.user_id,
          title: 'Comprobante no verificado',
          message: `El comprobante adjunto para "${payment.description}" no pudo ser validado. Por favor sube una imagen clara.`,
          type: 'warning',
          link: '/payments',
        });
      } catch (e) {
        console.warn(e);
      }

      if (viewingReceiptPayment?.id === payment.id) setViewingReceiptPayment(null);
      fetchData();
    }
    setActionLoadingId(null);
  };

  const resetForm = () => {
    setSelectedUser('');
    setDescription('');
    setAmount('');
    setDueDate('');
    setPaymentType('');
  };

  const getStatusBadge = (status: string, hasReceipt?: boolean) => {
    switch (status) {
      case 'paid':
        return <StatusBadge status="success">Pagado</StatusBadge>;
      case 'pending':
        return hasReceipt ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/30">
            <Clock className="w-3.5 h-3.5" />
            Por revisar
          </span>
        ) : (
          <StatusBadge status="warning">Pendiente</StatusBadge>
        );
      case 'overdue':
        return <StatusBadge status="destructive">Vencido</StatusBadge>;
      default:
        return <StatusBadge status="muted">{status}</StatusBadge>;
    }
  };

  const getUserDisplay = (profile: Profile) => {
    const name = profile.full_name || profile.email;
    const apt = profile.apartment_number ? ` (Apt ${profile.apartment_number})` : '';
    return `${name}${apt}`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-7xl mx-auto pb-16">
        {/* Header */}
        <div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary">
                  Finanzas
                </span>
              </div>
              <h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold text-foreground tracking-tight flex items-center gap-3">
                <CreditCard className="w-9 h-9 text-primary" />
                Cobranza
              </h1>
              <p className="text-muted-foreground text-base md:text-lg font-medium mt-1">
                Revisa comprobantes y registra cobros extraordinarios.
              </p>
            </div>

            <div className="flex items-center gap-3 self-stretch sm:self-auto">
              <Button 
                variant="outline"
                onClick={fetchData}
                disabled={loading}
                className="h-12 px-4 rounded-xl font-semibold gap-2 border-border/80"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refrescar</span>
              </Button>

              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="h-12 px-6 rounded-xl font-semibold gap-2 shadow-sm flex-1 sm:flex-none">
                    <Plus className="w-4 h-4" />
                    Registrar cargo
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg rounded-2xl">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-semibold">Nuevo cargo</DialogTitle>
                    <DialogDescription>
                      Asigna un cobro específico a un residente de la comunidad
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="manage-payments-residente" className="text-xs font-medium text-muted-foreground">Residente *</Label>
                      <Select value={selectedUser} onValueChange={setSelectedUser}>
                        <SelectTrigger id="manage-payments-residente" className="h-12 border border-border/80 rounded-xl font-semibold bg-background">
                          <SelectValue placeholder="Selecciona un residente" />
                        </SelectTrigger>
                        <SelectContent>
                          {profiles.map((profile) => (
                            <SelectItem key={profile.id} value={profile.id} className="font-semibold">
                              {getUserDisplay(profile)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="manage-payments-tipo-de-pago" className="text-xs font-medium text-muted-foreground">Tipo de pago *</Label>
                      <Select value={paymentType} onValueChange={setPaymentType}>
                        <SelectTrigger id="manage-payments-tipo-de-pago" className="h-12 border border-border/80 rounded-xl font-semibold bg-background">
                          <SelectValue placeholder="Selecciona tipo de cargo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly_dues" className="font-semibold">Alícuota ordinaria</SelectItem>
                          <SelectItem value="fine" className="font-semibold">Multa / infracción</SelectItem>
                          <SelectItem value="other" className="font-semibold">Servicio adicional</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="manage-payments-descripcion" className="text-xs font-medium text-muted-foreground">Descripción *</Label>
                      <Input id="manage-payments-descripcion"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Ej: Cuota extraordinaria reparación cisterna"
                        required
                        className="h-12 border border-border/80 rounded-xl font-semibold bg-background"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="manage-payments-monto" className="text-xs font-medium text-muted-foreground">Monto ($) *</Label>
                        <Input id="manage-payments-monto"
                          type="number"
                          step="0.01"
                          min="0"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="45.00"
                          required
                          className="h-12 border border-border/80 rounded-xl font-semibold bg-background"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="manage-payments-vencimiento" className="text-xs font-medium text-muted-foreground">Vencimiento *</Label>
                        <Input id="manage-payments-vencimiento"
                          type="date"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          required
                          className="h-12 border border-border/80 rounded-xl font-semibold bg-background"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-border/60">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="h-11 px-5 rounded-xl font-semibold">
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={isSubmitting} className="h-11 px-6 rounded-xl font-semibold shadow-sm">
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Guardando...
                          </>
                        ) : (
                          'Crear cargo'
                        )}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {/* Payments Table */}
        <div className="bg-card rounded-2xl overflow-hidden shadow-hairline">
          <div className="p-6 border-b border-border/80 bg-muted/30 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Cargos y recibos</h2>
              <p className="text-sm font-medium text-muted-foreground mt-0.5">
                Revisa las transferencias de los residentes y confirma sus pagos.
              </p>
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              {payments.length} transacciones registradas
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-20">
              <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-20" />
              <h3 className="font-semibold text-lg text-foreground">No hay registros de pago</h3>
              <p className="text-muted-foreground text-sm font-medium">Comienza registrando el primer cargo con el botón superior.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/80 bg-muted/40">
                    <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground">Residente</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground">Concepto</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground">Monto</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground">Vence</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground">Estado</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground">Comprobante</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => {
                    const isActing = actionLoadingId === payment.id;
                    return (
                      <tr key={payment.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-4 px-6">
                          <div>
                            <p className="font-semibold text-base text-foreground leading-tight">
                              {payment.profiles?.full_name || 'Desconocido'}
                            </p>
                            <p className="text-xs text-muted-foreground font-medium">
                              {payment.profiles?.apartment_number ? `Apto. ${payment.profiles.apartment_number} · ` : ''}{payment.profiles?.email}
                            </p>
                          </div>
                        </td>
                        <td className="py-4 px-6 font-semibold text-sm text-foreground">{payment.description}</td>
                        <td className="py-4 px-6 font-semibold text-lg text-foreground">${Number(payment.amount).toFixed(2)}</td>
                        <td className="py-4 px-6 text-muted-foreground text-sm">
                          {format(new Date(payment.due_date), 'd MMM, yyyy', { locale: es })}
                        </td>
                        <td className="py-4 px-6">{getStatusBadge(payment.status, !!payment.receipt_url)}</td>
                        
                        {/* Columna Comprobante */}
                        <td className="py-4 px-6">
                          {payment.receipt_url ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setViewingReceiptPayment(payment)}
                              className="gap-2 rounded-xl text-xs font-semibold h-10 px-4 border border-primary/40 text-primary hover:bg-primary/10 shadow-sm"
                            >
                              <Eye className="w-4 h-4" />
                              Ver recibo
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground/60 italic font-medium">
                              Sin recibo
                            </span>
                          )}
                        </td>

                        {/* Columna de acción */}
                        <td className="py-4 px-6">
                          {payment.status !== 'paid' ? (
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                disabled={isActing}
                                onClick={() => handleMarkPaid(payment)}
                                className="h-10 px-4 gap-1.5 rounded-xl font-semibold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-md active:scale-95 transition-[color,background-color,border-color,box-shadow,opacity,transform]"
                              >
                                {isActing ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Check className="w-4 h-4" />
                                )}
                                Aprobar
                              </Button>

                              {payment.receipt_url && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isActing}
                                  onClick={() => handleRejectPayment(payment)}
                                  className="h-10 px-3 gap-1 rounded-xl font-semibold text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 active:scale-95"
                                >
                                  <XCircle className="w-4 h-4" />
                                  Rechazar
                                </Button>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/30">
                              <CheckCircle2 className="w-4 h-4" />
                              Pagado
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal de Previsualización y Aprobación de Recibo */}
        <Dialog open={!!viewingReceiptPayment} onOpenChange={(open) => !open && setViewingReceiptPayment(null)}>
          <DialogContent className="max-w-2xl rounded-2xl p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-semibold text-foreground">
                <FileText className="w-5 h-5 text-primary" />
                Comprobante de Pago — {viewingReceiptPayment?.profiles?.full_name || 'Residente'}
              </DialogTitle>
              <DialogDescription className="font-medium">
                {viewingReceiptPayment ? `${viewingReceiptPayment.description} · Monto: $${Number(viewingReceiptPayment.amount).toFixed(2)}` : ''}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 flex justify-center bg-black/5 dark:bg-black/40 rounded-2xl p-4 overflow-hidden max-h-[65vh]">
              {viewingReceiptPayment?.receipt_url?.endsWith('.pdf') ? (
                <iframe src={viewingReceiptPayment.receipt_url} className="w-full h-96 rounded-xl" title="Comprobante PDF" />
              ) : (
                <img 
                  src={viewingReceiptPayment?.receipt_url || ''} 
                  alt="Foto del Comprobante" 
                  className="max-h-[55vh] max-w-full object-contain rounded-xl shadow-lg" 
                />
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border/80 mt-4">
              <Button variant="outline" onClick={() => setViewingReceiptPayment(null)} className="h-11 px-5 rounded-xl font-semibold">
                Cerrar
              </Button>

              {viewingReceiptPayment && viewingReceiptPayment.status !== 'paid' && (
                <div className="flex gap-2">
                  <Button 
                    variant="ghost"
                    onClick={() => handleRejectPayment(viewingReceiptPayment)}
                    disabled={actionLoadingId === viewingReceiptPayment.id}
                    className="h-11 px-4 rounded-xl font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-500/10"
                  >
                    <XCircle className="w-4 h-4 mr-1.5" />
                    Rechazar
                  </Button>
                  <Button 
                    onClick={() => handleMarkPaid(viewingReceiptPayment)}
                    disabled={actionLoadingId === viewingReceiptPayment.id}
                    className="h-11 px-6 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md active:scale-95 transition-[color,background-color,border-color,box-shadow,opacity,transform]"
                  >
                    {actionLoadingId === viewingReceiptPayment.id ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                    ) : (
                      <Check className="w-4 h-4 mr-1.5" />
                    )}
                    Aprobar
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default ManagePayments;
