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
import { CreditCard, Plus, Loader2, CheckCircle, Eye, XCircle, Check, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

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
    const [paymentsRes, profilesRes] = await Promise.all([
      supabase.from('payments').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email, apartment_number'),
    ]);

    if (profilesRes.data) setProfiles(profilesRes.data);
    
    if (paymentsRes.data && profilesRes.data) {
      const profilesMap = new Map(profilesRes.data.map(p => [p.id, p]));
      const paymentsWithProfiles = paymentsRes.data.map(p => ({
        ...p,
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
      toast.success('Registro de pago creado con éxito');
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
      .update({
        status: 'paid',
        paid_at: now,
        rejection_reason: null,
      })
      .eq('id', payment.id);

    if (error) {
      toast.error('Error al actualizar el pago: ' + error.message);
    } else {
      toast.success('¡Pago verificado y marcado como pagado con 1-click!');

      // Notificar al residente
      try {
        await supabase.from('notifications').insert({
          user_id: payment.user_id,
          title: 'Pago verificado',
          message: `Tu pago de "${payment.description}" por $${Number(payment.amount).toFixed(2)} ha sido aprobado.`,
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

    const { error } = await supabase
      .from('payments')
      .update({
        status: 'pending',
        receipt_url: null,
        rejection_reason: 'Comprobante no válido',
      })
      .eq('id', payment.id);

    if (error) {
      toast.error('Error al rechazar el comprobante');
    } else {
      toast.warning('Comprobante rechazado. Se notificó al residente.');

      try {
        await supabase.from('notifications').insert({
          user_id: payment.user_id,
          title: 'Comprobante no verificado',
          message: `El comprobante adjunto para "${payment.description}" no pudo ser validado.`,
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <StatusBadge status="success">Pagado</StatusBadge>;
      case 'pending':
        return <StatusBadge status="warning">Pendiente</StatusBadge>;
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
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold flex items-center gap-3 text-foreground tracking-tight">
              <CreditCard className="w-8 h-8 text-primary" />
              Gestión de Pagos y Cobros
            </h1>
            <p className="text-muted-foreground mt-1 font-medium">
              Verifica recibos en 1-click y administra los cargos de los residentes
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 rounded-2xl px-6 h-12 font-bold shadow-lg shadow-primary/20">
                <Plus className="w-4 h-4" />
                Registrar Cargo
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg rounded-2xl">
              <DialogHeader>
                <DialogTitle>Agregar Registro de Pago</DialogTitle>
                <DialogDescription>
                  Crea un nuevo cargo para un residente
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Residente *</Label>
                  <Select value={selectedUser} onValueChange={setSelectedUser}>
                    <SelectTrigger className="h-12 bg-muted/30 border-none rounded-xl font-bold">
                      <SelectValue placeholder="Selecciona un residente" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {getUserDisplay(profile)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Tipo de Pago *</Label>
                  <Select value={paymentType} onValueChange={setPaymentType}>
                    <SelectTrigger className="h-12 bg-muted/30 border-none rounded-xl font-bold">
                      <SelectValue placeholder="Selecciona tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly_dues">Alícuota Mensual</SelectItem>
                      <SelectItem value="fine">Multa</SelectItem>
                      <SelectItem value="other">Otro Cargo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Descripción *</Label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="ej. Alícuota Enero 2026"
                    required
                    className="h-12 bg-muted/30 border-none rounded-xl font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Monto ($) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="50.00"
                      required
                      className="h-12 bg-muted/30 border-none rounded-xl font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fecha de Vencimiento *</Label>
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      required
                      className="h-12 bg-muted/30 border-none rounded-xl font-bold"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="rounded-xl font-bold">
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting} className="rounded-xl px-8 font-bold shadow-md">
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creando...
                      </>
                    ) : (
                      'Crear Registro'
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Payments Table */}
        <Card className="card-elevated border-none shadow-xl overflow-hidden">
          <CardHeader className="bg-muted/20 border-b">
            <CardTitle className="text-xl font-black">Historial Global de Pagos</CardTitle>
            <CardDescription>Visualiza comprobantes y verifica pagos con un solo click</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : payments.length === 0 ? (
              <div className="text-center py-16">
                <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                <h3 className="font-bold text-lg">No hay registros de pago</h3>
                <p className="text-muted-foreground text-sm">Comienza registrando el primer cargo.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-left py-4 px-6 text-xs font-black text-muted-foreground uppercase tracking-wider">Residente</th>
                      <th className="text-left py-4 px-6 text-xs font-black text-muted-foreground uppercase tracking-wider">Descripción</th>
                      <th className="text-left py-4 px-6 text-xs font-black text-muted-foreground uppercase tracking-wider">Monto</th>
                      <th className="text-left py-4 px-6 text-xs font-black text-muted-foreground uppercase tracking-wider">Vencimiento</th>
                      <th className="text-left py-4 px-6 text-xs font-black text-muted-foreground uppercase tracking-wider">Estado</th>
                      <th className="text-left py-4 px-6 text-xs font-black text-muted-foreground uppercase tracking-wider">Comprobante</th>
                      <th className="text-left py-4 px-6 text-xs font-black text-muted-foreground uppercase tracking-wider">Acción 1-Click</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => {
                      const isActing = actionLoadingId === payment.id;
                      return (
                        <tr key={payment.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="py-4 px-6">
                            <div>
                              <p className="font-bold text-foreground leading-tight">{payment.profiles?.full_name || 'Desconocido'}</p>
                              <p className="text-xs text-muted-foreground font-medium">{payment.profiles?.email}</p>
                            </div>
                          </td>
                          <td className="py-4 px-6 font-medium text-sm">{payment.description}</td>
                          <td className="py-4 px-6 font-black text-lg">${Number(payment.amount).toFixed(2)}</td>
                          <td className="py-4 px-6 text-muted-foreground font-medium text-sm">
                            {format(new Date(payment.due_date), 'd MMM, yyyy', { locale: es })}
                          </td>
                          <td className="py-4 px-6">{getStatusBadge(payment.status)}</td>
                          
                          {/* Columna Comprobante */}
                          <td className="py-4 px-6">
                            {payment.receipt_url ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setViewingReceiptPayment(payment)}
                                className="gap-1.5 rounded-xl text-xs font-bold border-primary/30 text-primary hover:bg-primary/10"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Ver Recibo
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground/60 italic font-medium">
                                Sin recibo
                              </span>
                            )}
                          </td>

                          {/* Columna 1-Click */}
                          <td className="py-4 px-6">
                            {payment.status !== 'paid' ? (
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  disabled={isActing}
                                  onClick={() => handleMarkPaid(payment)}
                                  className="gap-1.5 rounded-xl font-black text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 active:scale-95"
                                >
                                  {isActing ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5" />
                                  )}
                                  Aprobar
                                </Button>

                                {payment.receipt_url && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={isActing}
                                    onClick={() => handleRejectPayment(payment)}
                                    className="gap-1 rounded-xl font-bold text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                    Rechazar
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                                <CheckCircle className="w-4 h-4" />
                                Verificado
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
          </CardContent>
        </Card>

        {/* Modal para ver comprobante de pago */}
        <Dialog open={!!viewingReceiptPayment} onOpenChange={(open) => !open && setViewingReceiptPayment(null)}>
          <DialogContent className="max-w-2xl rounded-2xl p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-black">
                <FileText className="w-5 h-5 text-primary" />
                Comprobante de Pago — {viewingReceiptPayment?.profiles?.full_name || 'Residente'}
              </DialogTitle>
              <DialogDescription>
                {viewingReceiptPayment?.description} — Monto: ${Number(viewingReceiptPayment?.amount).toFixed(2)}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 flex justify-center bg-black/5 dark:bg-black/30 rounded-2xl p-4 overflow-hidden max-h-[65vh]">
              {viewingReceiptPayment?.receipt_url?.endsWith('.pdf') ? (
                <iframe src={viewingReceiptPayment.receipt_url} className="w-full h-96 rounded-xl" title="Comprobante PDF" />
              ) : (
                <img 
                  src={viewingReceiptPayment?.receipt_url || ''} 
                  alt="Comprobante" 
                  className="max-h-[55vh] max-w-full object-contain rounded-xl shadow-lg" 
                />
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border/50">
              <Button variant="outline" onClick={() => setViewingReceiptPayment(null)} className="rounded-xl font-bold">
                Cerrar
              </Button>

              {viewingReceiptPayment && viewingReceiptPayment.status !== 'paid' && (
                <div className="flex gap-2">
                  <Button 
                    variant="ghost"
                    onClick={() => handleRejectPayment(viewingReceiptPayment)}
                    disabled={actionLoadingId === viewingReceiptPayment.id}
                    className="rounded-xl font-bold text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                  >
                    <XCircle className="w-4 h-4 mr-1.5" />
                    Rechazar
                  </Button>
                  <Button 
                    onClick={() => handleMarkPaid(viewingReceiptPayment)}
                    disabled={actionLoadingId === viewingReceiptPayment.id}
                    className="rounded-xl font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20"
                  >
                    {actionLoadingId === viewingReceiptPayment.id ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                    ) : (
                      <Check className="w-4 h-4 mr-1.5" />
                    )}
                    Aprobar Ahora
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
