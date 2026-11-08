import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  DollarSign, 
  Building, 
  Plus, 
  Loader2, 
  Send, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Pencil, 
  Trash2, 
  Eye, 
  XCircle, 
  FileText, 
  Check,
  Search,
  RefreshCw,
  Sparkles,
  Download,
  Receipt
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { getReceiptUrl, clearLocalReceipt } from '@/lib/receiptStorage';
import { approvalUpdate, rejectionUpdate } from '@/lib/receiptReview';

interface ApartmentType {
  id: string;
  name: string;
  monthly_fee: number;
  description: string | null;
}

interface Due {
  id: string;
  user_id: string;
  apartment_type_id: string | null;
  amount: number;
  month: number;
  year: number;
  status: string;
  paid_at: string | null;
  notes: string | null;
  receipt_url?: string | null;
  rejection_reason?: string | null;
  created_at: string;
}

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  apartment_number: string | null;
  apartment_type_id: string | null;
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const ManageDues = () => {
  const { user } = useAuth();
  const [apartmentTypes, setApartmentTypes] = useState<ApartmentType[]>([]);
  const [dues, setDues] = useState<Due[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'need_review' | 'pending' | 'paid'>('all');
  const [filterMonth, setFilterMonth] = useState(String(new Date().getMonth() + 1));
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));

  // Modal para ver comprobante
  const [selectedReceiptDue, setSelectedReceiptDue] = useState<Due | null>(null);

  // Tipos de apartamento
  const [showTypeDialog, setShowTypeDialog] = useState(false);
  const [editingType, setEditingType] = useState<ApartmentType | null>(null);
  const [typeName, setTypeName] = useState('');
  const [typeFee, setTypeFee] = useState('');
  const [typeDesc, setTypeDesc] = useState('');

  // Generación masiva
  const [genMonth, setGenMonth] = useState(String(new Date().getMonth() + 1));
  const [genYear, setGenYear] = useState(String(new Date().getFullYear()));

  const fetchData = async () => {
    setLoading(true);
    const [typesRes, duesRes, profilesRes] = await Promise.all([
      supabase.from('apartment_types').select('*').order('name'),
      supabase.from('dues').select('*').eq('month', Number(filterMonth)).eq('year', Number(filterYear)).order('created_at', { ascending: false }),
      supabase.from('profiles').select('*'),
    ]);

    if (typesRes.data) setApartmentTypes(typesRes.data);
    if (duesRes.data) {
      const list = ((duesRes.data as unknown as Due[]) || []).map(d => ({
        ...d,
        receipt_url: getReceiptUrl(d.id, d.receipt_url)
      }));
      setDues(list);
    }
    if (profilesRes.data) setProfiles(profilesRes.data as Profile[]);
    setLoading(false);
  };

  useEffect(() => { 
    fetchData(); 

    const channel = supabase.channel('manage-dues-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dues' }, () => {
        fetchData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [filterMonth, filterYear]);

  // APROBAR RECIBO CON 1-CLICK
  const handleApproveDue = async (due: Due) => {
    setActionLoadingId(due.id);
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('dues')
      .update(approvalUpdate(new Date(now)))
      .eq('id', due.id);

    if (error) {
      toast.error('Error al aprobar: ' + error.message);
      setActionLoadingId(null);
      return;
    }

    try {
      await supabase.from('notifications').insert({
        user_id: due.user_id,
        title: `Alícuota aprobada - ${MONTHS[due.month - 1]} ${due.year}`,
        message: `Tu comprobante por $${Number(due.amount).toFixed(2)} ha sido verificado con éxito.`,
        type: 'success',
        link: '/dues',
      });
    } catch (e) {
      console.warn(e);
    }

    toast.success('Alícuota aprobada.');
    if (selectedReceiptDue?.id === due.id) setSelectedReceiptDue(null);
    setActionLoadingId(null);
    fetchData();
  };

  // RECHAZAR RECIBO CON 1-CLICK
  const handleRejectDue = async (due: Due) => {
    setActionLoadingId(due.id);
    clearLocalReceipt(due.id);

    const { error } = await supabase
      .from('dues')
      .update(rejectionUpdate())
      .eq('id', due.id);

    if (error) {
      toast.error('Error al rechazar: ' + error.message);
      setActionLoadingId(null);
      return;
    }

    try {
      await supabase.from('notifications').insert({
        user_id: due.user_id,
        title: `Comprobante rechazado - ${MONTHS[due.month - 1]} ${due.year}`,
        message: `El comprobante no pudo ser validado. Por favor sube una captura clara.`,
        type: 'warning',
        link: '/dues',
      });
    } catch (e) {
      console.warn(e);
    }

    toast.warning('Comprobante rechazado. Se notificó al residente.');
    if (selectedReceiptDue?.id === due.id) setSelectedReceiptDue(null);
    setActionLoadingId(null);
    fetchData();
  };

  const handleReopenDue = async (dueId: string) => {
    setActionLoadingId(dueId);
    const { error } = await supabase.from('dues').update({ status: 'pending', paid_at: null }).eq('id', dueId);
    if (error) toast.error('Error al reabrir');
    else {
      toast.info('Alícuota reabierta como pendiente');
      fetchData();
    }
    setActionLoadingId(null);
  };

  const handleSaveType = async () => {
    if (!typeName.trim() || !typeFee) { toast.error('Nombre y monto son requeridos'); return; }
    if (!(Number(typeFee) >= 0)) { toast.error('La cuota mensual no puede ser negativa'); return; }

    if (editingType) {
      const { error } = await supabase.from('apartment_types').update({
        name: typeName, monthly_fee: Number(typeFee), description: typeDesc || null,
      }).eq('id', editingType.id);
      if (error) { toast.error('Error al actualizar'); return; }
      toast.success('Tipo actualizado');
    } else {
      const { error } = await supabase.from('apartment_types').insert({
        name: typeName.trim(), monthly_fee: Number(typeFee), description: typeDesc.trim() || null,
      });
      if (error) { toast.error('Error al crear'); return; }
      toast.success('Tipo creado');
    }

    setShowTypeDialog(false);
    setEditingType(null);
    setTypeName(''); setTypeFee(''); setTypeDesc('');
    fetchData();
  };

  const handleDeleteType = async (id: string) => {
    const { error } = await supabase.from('apartment_types').delete().eq('id', id);
    if (error) { toast.error('Error al eliminar'); return; }
    toast.success('Tipo eliminado');
    fetchData();
  };

  const handleGenerateDues = async () => {
    const month = Number(genMonth);
    const year = Number(genYear);
    
    const residentsWithTypes = profiles.filter(p => p.apartment_type_id);
    if (residentsWithTypes.length === 0) {
      toast.error('No hay residentes con tipo de apartamento asignado');
      return;
    }

    setGenerating(true);
    let created = 0;
    let skipped = 0;

    for (const resident of residentsWithTypes) {
      const aptType = apartmentTypes.find(t => t.id === resident.apartment_type_id);
      if (!aptType) continue;

      const { error } = await supabase.from('dues').insert({
        user_id: resident.id,
        apartment_type_id: resident.apartment_type_id,
        amount: aptType.monthly_fee,
        month,
        year,
        status: 'pending',
      });

      if (error) {
        if (error.code === '23505') { skipped++; }
        else { toast.error(`Error generando alícuota para ${resident.full_name || resident.email}`); }
      } else {
        created++;
      }
    }

    setGenerating(false);
    // Con el índice único, las alícuotas ya emitidas ese mes se omiten (error 23505)
    toast.success(
      skipped > 0
        ? `${created} alícuotas generadas; ${skipped} ya existían y se omitieron`
        : `${created} alícuotas generadas`
    );
    setFilterMonth(genMonth);
    setFilterYear(genYear);
    fetchData();
  };

  const getProfileName = (userId: string) => {
    const p = profiles.find(pr => pr.id === userId);
    return p?.full_name || p?.email || 'Desconocido';
  };

  const getProfileApt = (userId: string) => {
    const p = profiles.find(pr => pr.id === userId);
    return p?.apartment_number ? `Apto ${p.apartment_number}` : '-';
  };

  const summary = dues.reduce((acc, d) => {
    acc.total += Number(d.amount);
    if (d.status === 'paid') acc.paid += Number(d.amount);
    if (d.status === 'pending') {
      acc.pending += Number(d.amount);
      if (d.receipt_url) acc.needReview += 1;
    }
    if (d.status === 'overdue') acc.overdue += Number(d.amount);
    return acc;
  }, { total: 0, paid: 0, pending: 0, overdue: 0, needReview: 0 });

  const filteredDues = dues.filter(d => {
    const name = getProfileName(d.user_id).toLowerCase();
    const apt = getProfileApt(d.user_id).toLowerCase();
    const matchesSearch = name.includes(searchQuery.toLowerCase()) || apt.includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (statusFilter === 'need_review') return d.status !== 'paid' && Boolean(d.receipt_url);
    if (statusFilter === 'pending') return d.status !== 'paid' && !d.receipt_url;
    if (statusFilter === 'paid') return d.status === 'paid';
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-8 pb-16">
        {/* Cabecera del Módulo */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary">
                <Receipt className="w-3.5 h-3.5" />
                Finanzas
              </span>
            </div>
            <h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold text-foreground tracking-tight font-display">
              Alícuotas
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base mt-1">
              Revisa los comprobantes de pago y administra las tarifas por tipo de departamento.
            </p>
          </div>

          <Button 
            variant="outline" 
            onClick={fetchData} 
            disabled={loading}
            className="h-12 px-5 rounded-xl font-semibold gap-2 border border-border/80"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </Button>
        </div>

        {/* Pestañas de Gestión */}
        <Tabs defaultValue="dues" className="space-y-6">
          <TabsList className="bg-muted/60 p-1.5 rounded-2xl border border-border/80 h-auto">
            <TabsTrigger value="dues" className="rounded-xl font-semibold text-xs sm:text-sm px-5 py-2.5">
              Alícuotas y recibos
            </TabsTrigger>
            <TabsTrigger value="types" className="rounded-xl font-semibold text-xs sm:text-sm px-5 py-2.5">
              Tipos de departamento
            </TabsTrigger>
            <TabsTrigger value="generate" className="rounded-xl font-semibold text-xs sm:text-sm px-5 py-2.5">
              Emitir del mes
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: ALÍCUOTAS Y VERIFICACIÓN */}
          <TabsContent value="dues" className="space-y-6">
            
            {/* Barra de Controles y Búsqueda */}
            <div className="rounded-2xl bg-card p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 shadow-hairline">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor="manage-dues-mes" className="text-xs font-medium text-muted-foreground">Mes:</Label>
                  <Select value={filterMonth} onValueChange={setFilterMonth}>
                    <SelectTrigger id="manage-dues-mes" className="w-36 h-11 rounded-xl font-semibold border border-border/80 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)} className="font-semibold">{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Label htmlFor="manage-dues-ano" className="text-xs font-medium text-muted-foreground">Año:</Label>
                  <Input id="manage-dues-ano" 
                    type="number" 
                    value={filterYear} 
                    onChange={e => setFilterYear(e.target.value)} 
                    className="w-24 h-11 rounded-xl font-semibold border border-border/80 bg-background" 
                  />
                </div>

                {/* Buscador por residente o departamento */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar residente o apto..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-10 h-11 rounded-xl border border-border/80 bg-background text-sm font-semibold"
                  />
                </div>
              </div>

              {/* Filtro rápido por estado */}
              <div className="flex flex-wrap items-center gap-1.5 bg-muted/60 p-1 rounded-xl border border-border/60">
                <Button
                  variant={statusFilter === 'all' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setStatusFilter('all')}
                  className="rounded-lg text-xs font-semibold h-9"
                >
                  Todos ({dues.length})
                </Button>
                <Button
                  variant={statusFilter === 'need_review' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setStatusFilter('need_review')}
                  className={`rounded-lg text-xs font-semibold h-9 gap-1.5 ${
                    summary.needReview > 0 ? 'bg-amber-500 text-white hover:bg-amber-600' : ''
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Por verificar ({summary.needReview})
                </Button>
                <Button
                  variant={statusFilter === 'paid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setStatusFilter('paid')}
                  className="rounded-lg text-xs font-semibold h-9"
                >
                  Pagadas
                </Button>
              </div>
            </div>

            {/* Métricas del Período Seleccionado */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-card shadow-hairline">
                <p className="text-xs font-medium text-muted-foreground">Total emitido</p>
                <p className="text-2xl sm:text-3xl font-semibold text-foreground font-display mt-1">${summary.total.toFixed(2)}</p>
              </div>
              <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 shadow-sm">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Cobrado y verificado</p>
                <p className="text-2xl sm:text-3xl font-semibold text-emerald-800 dark:text-emerald-300 font-display mt-1">${summary.paid.toFixed(2)}</p>
              </div>
              <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 shadow-sm">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Por revisar</p>
                <p className="text-2xl sm:text-3xl font-semibold text-amber-800 dark:text-amber-300 font-display mt-1">{summary.needReview}</p>
              </div>
              <div className="p-5 rounded-2xl bg-card shadow-hairline">
                <p className="text-xs font-medium text-muted-foreground">Por cobrar total</p>
                <p className="text-2xl sm:text-3xl font-semibold text-foreground font-display mt-1">${summary.pending.toFixed(2)}</p>
              </div>
            </div>

            {/* Tabla de Alícuotas con Acción */}
            <div className="rounded-2xl bg-card overflow-hidden shadow-hairline">
              <div className="p-5 sm:p-6 border-b border-border/80 bg-muted/30 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg text-foreground font-display">
                    Alícuotas de {MONTHS[Number(filterMonth) - 1]} {filterYear}
                  </h3>
                  <p className="text-xs font-medium text-muted-foreground mt-0.5">
                    Mostrando {filteredDues.length} registros
                  </p>
                </div>
              </div>

              {loading ? (
                <div className="py-20 flex justify-center"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>
              ) : filteredDues.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground font-semibold">
                  No se encontraron alícuotas para el período o búsqueda especificada.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/80 bg-muted/40">
                        <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground">Residente</th>
                        <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground">Unidad</th>
                        <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground">Cuota</th>
                        <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground">Estado</th>
                        <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground">Comprobante</th>
                        <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDues.map((due) => {
                        const isLoading = actionLoadingId === due.id;
                        return (
                          <tr key={due.id} className="border-b border-border/60 hover:bg-muted/20 transition-colors">
                            <td className="py-4 px-6">
                              <p className="font-semibold text-base text-foreground leading-tight font-display">
                                {getProfileName(due.user_id)}
                              </p>
                            </td>
                            <td className="py-4 px-6 font-semibold text-muted-foreground">
                              {getProfileApt(due.user_id)}
                            </td>
                            <td className="py-4 px-6 font-semibold text-lg text-foreground font-display tabular-nums">
                              ${Number(due.amount).toFixed(2)}
                            </td>
                            <td className="py-4 px-6">
                              {due.status === 'paid' && <StatusBadge status="success">Pagada</StatusBadge>}
                              {due.status === 'pending' && (
                                due.receipt_url ? (
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/30 animate-pulse">
                                    <Clock className="w-3.5 h-3.5" />
                                    Por revisar
                                  </span>
                                ) : (
                                  <StatusBadge status="warning">Pendiente</StatusBadge>
                                )
                              )}
                              {due.status === 'overdue' && <StatusBadge status="destructive">Vencida</StatusBadge>}
                            </td>

                            <td className="py-4 px-6">
                              {due.receipt_url ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedReceiptDue(due)}
                                  className="gap-2 rounded-xl text-xs font-semibold h-10 px-4 border border-primary/40 text-primary hover:bg-primary/10 shadow-sm"
                                >
                                  <Eye className="w-4 h-4" />
                                  Ver recibo
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground/60 font-medium italic">Sin comprobante</span>
                              )}
                            </td>

                            <td className="py-4 px-6">
                              <div className="flex items-center gap-2">
                                {due.status !== 'paid' ? (
                                  <>
                                    <Button
                                      size="sm"
                                      disabled={isLoading}
                                      onClick={() => handleApproveDue(due)}
                                      className="h-10 px-4 gap-1.5 rounded-xl font-semibold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-md active:scale-95 transition-[color,background-color,border-color,box-shadow,opacity,transform]"
                                    >
                                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                      Aprobar
                                    </Button>

                                    {due.receipt_url && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={isLoading}
                                        onClick={() => handleRejectDue(due)}
                                        className="h-10 px-3 gap-1 rounded-xl font-semibold text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-500/10"
                                      >
                                        <XCircle className="w-4 h-4" />
                                        Rechazar
                                      </Button>
                                    )}
                                  </>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/30">
                                      <CheckCircle2 className="w-4 h-4" />
                                      Verificado
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={isLoading}
                                      onClick={() => handleReopenDue(due.id)}
                                      className="text-xs text-muted-foreground hover:text-foreground h-8 px-2 font-medium"
                                    >
                                      Reabrir
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB 2: TIPOS DE APARTAMENTO */}
          <TabsContent value="types" className="space-y-6">
            <div className="flex justify-between items-center rounded-2xl bg-card p-6 shadow-hairline">
              <div>
                <h3 className="text-2xl font-semibold text-foreground font-display">Tarifas por tipo de departamento</h3>
                <p className="text-xs font-medium text-muted-foreground mt-0.5">Establece el valor mensual de alícuotas según el tipo de departamento</p>
              </div>

              <Dialog open={showTypeDialog} onOpenChange={setShowTypeDialog}>
                <DialogTrigger asChild>
                  <Button className="h-12 px-6 rounded-xl font-semibold gap-2 shadow-sm">
                    <Plus className="w-4 h-4" /> Nuevo modelo
                  </Button>
                </DialogTrigger>
                <DialogContent className="rounded-2xl sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-semibold font-display">
                      {editingType ? 'Editar' : 'Nuevo'} Tipo de Apartamento
                    </DialogTitle>
                    <DialogDescription>Define el nombre del modelo y su cuota mensual</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="manage-dues-nombre-del-tipo" className="text-xs font-medium text-muted-foreground">Nombre del tipo *</Label>
                      <Input id="manage-dues-nombre-del-tipo" value={typeName} onChange={e => setTypeName(e.target.value)} placeholder="Ej: 3 Dormitorios Penthouse" className="h-12 rounded-xl font-semibold border border-border/80" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="manage-dues-cuota-mensual" className="text-xs font-medium text-muted-foreground">Cuota mensual ($) *</Label>
                      <Input id="manage-dues-cuota-mensual" type="number" value={typeFee} onChange={e => setTypeFee(e.target.value)} placeholder="65.00" className="h-12 rounded-xl font-semibold border border-border/80" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="manage-dues-descripcion" className="text-xs font-medium text-muted-foreground">Descripción</Label>
                      <Input id="manage-dues-descripcion" value={typeDesc} onChange={e => setTypeDesc(e.target.value)} placeholder="Metraje o ubicación" className="h-12 rounded-xl font-medium border border-border/80" />
                    </div>
                    <Button onClick={handleSaveType} className="w-full h-12 rounded-xl font-semibold text-base mt-2 shadow-sm">
                      {editingType ? 'Actualizar modelo' : 'Guardar modelo'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {apartmentTypes.map(type => (
                <div key={type.id} className="rounded-2xl bg-card p-6 flex flex-col justify-between shadow-hairline">
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="text-xl font-semibold text-foreground font-display">{type.name}</h4>
                        {type.description && <p className="text-xs text-muted-foreground font-medium mt-1">{type.description}</p>}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => {
                          setEditingType(type);
                          setTypeName(type.name);
                          setTypeFee(String(type.monthly_fee));
                          setTypeDesc(type.description || '');
                          setShowTypeDialog(true);
                        }} className="h-8 w-8 text-muted-foreground hover:text-foreground">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteType(type.id)} className="h-8 w-8 text-rose-500 hover:text-rose-600">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-border/60 mt-4 flex items-baseline justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Cuota ordinaria</span>
                    <p className="text-3xl font-semibold text-primary font-display">${Number(type.monthly_fee).toFixed(2)}<span className="text-xs text-muted-foreground font-normal">/mes</span></p>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* TAB 3: GENERACIÓN MASIVA */}
          <TabsContent value="generate" className="space-y-6">
            <div className="rounded-2xl bg-card p-8 max-w-xl space-y-6 shadow-hairline">
              <div className="flex items-center gap-3 pb-4 border-b border-border/60">
                <div className="flex items-center justify-center text-muted-foreground">
                  <Send className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-semibold text-foreground font-display">Emitir alícuotas del mes</h3>
                  <p className="text-xs font-medium text-muted-foreground">Genera las cuotas del mes para todos los departamentos con tipo asignado</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="manage-dues-mes-2" className="text-xs font-medium text-muted-foreground">Mes</Label>
                  <Select value={genMonth} onValueChange={setGenMonth}>
                    <SelectTrigger id="manage-dues-mes-2" className="h-12 rounded-xl font-semibold border border-border/80 bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)} className="font-semibold">{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="manage-dues-ano-2" className="text-xs font-medium text-muted-foreground">Año</Label>
                  <Input id="manage-dues-ano-2" type="number" value={genYear} onChange={e => setGenYear(e.target.value)} className="h-12 rounded-xl font-semibold border border-border/80 bg-background" />
                </div>

                <div className="p-4 rounded-2xl bg-muted/40 border border-border/60 text-xs text-muted-foreground font-medium">
                  Se emitirá la cuota correspondiente a los residentes registrados que tengan asignado un tipo de departamento.
                </div>

                <Button 
                  onClick={handleGenerateDues} 
                  disabled={generating} 
                  className="w-full h-14 rounded-2xl font-semibold text-base shadow-md active:scale-95 transition-[color,background-color,border-color,box-shadow,opacity,transform]"
                >
                  {generating ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : 'Emitir alícuotas del mes'}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Modal de Previsualización y Verificación de Recibo */}
        <Dialog open={!!selectedReceiptDue} onOpenChange={(open) => !open && setSelectedReceiptDue(null)}>
          <DialogContent className="max-w-2xl rounded-2xl p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-semibold font-display text-foreground">
                <FileText className="w-5 h-5 text-primary" />
                Comprobante de Pago — {selectedReceiptDue ? getProfileName(selectedReceiptDue.user_id) : ''}
              </DialogTitle>
              <DialogDescription className="font-semibold">
                {selectedReceiptDue ? `${getProfileApt(selectedReceiptDue.user_id)} · ${MONTHS[selectedReceiptDue.month - 1]} ${selectedReceiptDue.year} · Monto: $${Number(selectedReceiptDue.amount).toFixed(2)}` : ''}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 flex justify-center bg-black/5 dark:bg-black/40 rounded-2xl p-4 overflow-hidden max-h-[65vh]">
              {selectedReceiptDue?.receipt_url?.endsWith('.pdf') ? (
                <iframe src={selectedReceiptDue.receipt_url} className="w-full h-96 rounded-xl" title="Comprobante PDF" />
              ) : (
                <img 
                  src={selectedReceiptDue?.receipt_url || ''} 
                  alt="Foto del Comprobante" 
                  className="max-h-[55vh] max-w-full object-contain rounded-xl shadow-lg" 
                />
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border/80 mt-4">
              <Button variant="outline" onClick={() => setSelectedReceiptDue(null)} className="h-11 px-5 rounded-xl font-semibold">
                Cerrar
              </Button>

              {selectedReceiptDue && selectedReceiptDue.status !== 'paid' && (
                <div className="flex gap-2">
                  <Button 
                    variant="ghost"
                    onClick={() => handleRejectDue(selectedReceiptDue)}
                    disabled={actionLoadingId === selectedReceiptDue.id}
                    className="h-11 px-4 rounded-xl font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-500/10"
                  >
                    <XCircle className="w-4 h-4 mr-1.5" />
                    Rechazar
                  </Button>
                  <Button 
                    onClick={() => handleApproveDue(selectedReceiptDue)}
                    disabled={actionLoadingId === selectedReceiptDue.id}
                    className="h-11 px-6 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md active:scale-95 transition-[color,background-color,border-color,box-shadow,opacity,transform]"
                  >
                    {actionLoadingId === selectedReceiptDue.id ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
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

export default ManageDues;
