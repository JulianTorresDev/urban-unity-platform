import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { StatCard } from '@/components/ui/StatCard';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DollarSign, CheckCircle, Clock, AlertCircle, Loader2, Receipt, History, Upload, Eye, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

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

    if (error) toast.error('Error al cargar alícuotas');
    else setDues((data as unknown as Due[]) || []);
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
      const fileName = `receipt-${uploadingDueId}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        toast.error('Error al subir comprobante: ' + uploadError.message);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('receipts')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('dues')
        .update({ receipt_url: publicUrl })
        .eq('id', uploadingDueId);

      if (updateError) {
        toast.error('Error al asociar el comprobante');
      } else {
        toast.success('Comprobante subido. La administración lo verificará en breve.');
        fetchDues();
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Error inesperado al subir');
    } finally {
      setIsUploading(false);
      setUploadingDueId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const summary = dues.reduce((acc, d) => {
    acc.total += Number(d.amount);
    if (d.status === 'paid') acc.paid += Number(d.amount);
    if (d.status === 'pending') acc.pending += Number(d.amount);
    if (d.status === 'overdue') acc.overdue += Number(d.amount);
    return acc;
  }, { total: 0, paid: 0, pending: 0, overdue: 0 });

  return (
    <DashboardLayout>
      <div className="space-y-10">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="font-display text-4xl font-black flex items-center gap-3 text-foreground tracking-tight">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Receipt className="w-8 h-8 text-primary" />
            </div>
            Gestión de Alícuotas
          </h1>
          <p className="text-muted-foreground mt-2 font-medium">Control de cuotas y comprobantes de pago</p>
        </motion.div>

        {/* Input oculto para subir comprobante */}
        <input 
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={handleFileUpload}
          className="hidden"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <StatCard title="Total" value={`$${summary.total.toFixed(2)}`} icon={DollarSign} variant="primary" />
          <StatCard title="Pagadas" value={`$${summary.paid.toFixed(2)}`} icon={CheckCircle} variant="success" />
          <StatCard title="Pendientes" value={`$${summary.pending.toFixed(2)}`} icon={Clock} variant="warning" />
          <StatCard title="Vencidas" value={`$${summary.overdue.toFixed(2)}`} icon={AlertCircle} variant="destructive" />
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-black flex items-center gap-2 px-1 uppercase tracking-wider text-muted-foreground">
            <History className="w-5 h-5" />
            Historial de Alícuotas
          </h2>
          
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Recuperando registros...</p>
            </div>
          ) : dues.length === 0 ? (
            <Card className="card-elevated border-none shadow-2xl p-20 text-center bg-card/30 backdrop-blur-xl">
              <CardContent>
                <Receipt className="w-12 h-12 text-muted-foreground/30 mx-auto mb-6" />
                <h3 className="font-black text-2xl text-foreground">Sin registros</h3>
                <p className="text-muted-foreground font-medium mt-2">Tu historial de cuotas de mantenimiento aparecerá aquí.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Desktop View */}
              <Card className="hidden md:block card-elevated border-none shadow-2xl overflow-hidden bg-card/40 backdrop-blur-xl">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/20">
                        <th className="text-left py-5 px-8 text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">Período</th>
                        <th className="text-left py-5 px-8 text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">Monto</th>
                        <th className="text-left py-5 px-8 text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">Estado</th>
                        <th className="text-left py-5 px-8 text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">Comprobante / Recibo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dues.map((due) => (
                        <tr key={due.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors group">
                          <td className="py-5 px-8">
                            <p className="font-bold text-foreground group-hover:text-primary transition-colors">
                              {MONTHS[due.month - 1]} {due.year}
                            </p>
                            {due.paid_at && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Pagado el {new Date(due.paid_at).toLocaleDateString()}
                              </p>
                            )}
                          </td>
                          <td className="py-5 px-8">
                            <p className="font-black text-lg text-foreground tracking-tight">${Number(due.amount).toFixed(2)}</p>
                          </td>
                          <td className="py-5 px-8">
                            {due.status === 'paid' && <StatusBadge status="success">Pagada</StatusBadge>}
                            {due.status === 'pending' && (
                              due.receipt_url ? (
                                <StatusBadge status="warning">En Revisión</StatusBadge>
                              ) : (
                                <StatusBadge status="warning">Pendiente</StatusBadge>
                              )
                            )}
                            {due.status === 'overdue' && <StatusBadge status="destructive">Vencida</StatusBadge>}
                          </td>
                          <td className="py-5 px-8">
                            <div className="flex items-center gap-3">
                              {due.receipt_url && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setViewingReceiptUrl(due.receipt_url || null)}
                                  className="rounded-xl font-bold gap-1.5 text-xs border-primary/20 hover:bg-primary/10 text-primary"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  Ver Recibo
                                </Button>
                              )}

                              {due.status !== 'paid' && (
                                <Button
                                  variant={due.receipt_url ? 'ghost' : 'default'}
                                  size="sm"
                                  disabled={isUploading && uploadingDueId === due.id}
                                  onClick={() => handleSelectFile(due.id)}
                                  className="rounded-xl font-bold gap-1.5 text-xs"
                                >
                                  {isUploading && uploadingDueId === due.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Upload className="w-3.5 h-3.5" />
                                  )}
                                  {due.receipt_url ? 'Cambiar Recibo' : 'Subir Comprobante'}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Mobile View */}
              <div className="md:hidden space-y-4">
                {dues.map((due) => (
                  <Card key={due.id} className="card-elevated border-none shadow-lg bg-card/40 backdrop-blur-xl p-5 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-black text-foreground text-lg">{MONTHS[due.month - 1]} {due.year}</h4>
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">Cuota de Mantenimiento</p>
                      </div>
                      {due.status === 'paid' && <StatusBadge status="success">Pagada</StatusBadge>}
                      {due.status === 'pending' && (
                        due.receipt_url ? (
                          <StatusBadge status="warning">En Revisión</StatusBadge>
                        ) : (
                          <StatusBadge status="warning">Pendiente</StatusBadge>
                        )
                      )}
                      {due.status === 'overdue' && <StatusBadge status="destructive">Vencida</StatusBadge>}
                    </div>

                    <div className="flex justify-between items-center pt-1 border-t border-border/40">
                      <div>
                        <p className="text-xs text-muted-foreground font-bold">Monto</p>
                        <p className="text-2xl font-black text-primary tracking-tight">
                          ${Number(due.amount).toFixed(2)}
                        </p>
                      </div>
                      
                      <div className="flex gap-2">
                        {due.receipt_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setViewingReceiptUrl(due.receipt_url || null)}
                            className="rounded-xl font-bold text-xs gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Ver
                          </Button>
                        )}
                        {due.status !== 'paid' && (
                          <Button
                            size="sm"
                            onClick={() => handleSelectFile(due.id)}
                            disabled={isUploading && uploadingDueId === due.id}
                            className="rounded-xl font-bold text-xs gap-1"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            {due.receipt_url ? 'Cambiar' : 'Subir'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Modal para visualizar el comprobante */}
        <Dialog open={!!viewingReceiptUrl} onOpenChange={(open) => !open && setViewingReceiptUrl(null)}>
          <DialogContent className="max-w-2xl rounded-2xl p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Comprobante de Pago
              </DialogTitle>
              <DialogDescription>
                Fotografía o captura de la transferencia bancaria
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 flex justify-center bg-black/5 dark:bg-black/30 rounded-2xl p-4 overflow-hidden max-h-[70vh]">
              {viewingReceiptUrl?.endsWith('.pdf') ? (
                <iframe src={viewingReceiptUrl} className="w-full h-96 rounded-xl" title="Comprobante PDF" />
              ) : (
                <img 
                  src={viewingReceiptUrl || ''} 
                  alt="Comprobante de pago" 
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

export default Dues;
