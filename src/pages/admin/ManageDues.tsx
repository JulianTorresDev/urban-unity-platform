import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { StatCard } from '@/components/ui/StatCard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DollarSign, Building, Plus, Loader2, Send, CheckCircle, Clock, AlertCircle, Pencil, Trash2, Eye, XCircle, FileText, Check } from 'lucide-react';
import { toast } from 'sonner';

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

  // Modal para ver comprobante
  const [selectedReceiptDue, setSelectedReceiptDue] = useState<Due | null>(null);

  // Apartment type form
  const [showTypeDialog, setShowTypeDialog] = useState(false);
  const [editingType, setEditingType] = useState<ApartmentType | null>(null);
  const [typeName, setTypeName] = useState('');
  const [typeFee, setTypeFee] = useState('');
  const [typeDesc, setTypeDesc] = useState('');

  // Generate dues form
  const [genMonth, setGenMonth] = useState(String(new Date().getMonth() + 1));
  const [genYear, setGenYear] = useState(String(new Date().getFullYear()));

  // Filter
  const [filterMonth, setFilterMonth] = useState(String(new Date().getMonth() + 1));
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));

  const fetchData = async () => {
    setLoading(true);
    const [typesRes, duesRes, profilesRes] = await Promise.all([
      supabase.from('apartment_types').select('*').order('name'),
      supabase.from('dues').select('*').eq('month', Number(filterMonth)).eq('year', Number(filterYear)).order('created_at', { ascending: false }),
      supabase.from('profiles').select('*'),
    ]);

    if (typesRes.data) setApartmentTypes(typesRes.data);
    if (duesRes.data) setDues((duesRes.data as unknown as Due[]) || []);
    if (profilesRes.data) setProfiles(profilesRes.data as Profile[]);
    setLoading(false);
  };

  useEffect(() => { 
    fetchData(); 

    // Realtime listener para reflejar alícuotas y comprobantes subidos
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
      .update({ 
        status: 'paid', 
        paid_at: now,
        rejection_reason: null
      })
      .eq('id', due.id);

    if (error) {
      toast.error('Error al aprobar alícuota: ' + error.message);
      setActionLoadingId(null);
      return;
    }

    // Notificar al residente
    try {
      await supabase.from('notifications').insert({
        user_id: due.user_id,
        title: `Alícuota aprobada - ${MONTHS[due.month - 1]} ${due.year}`,
        message: `Tu comprobante de pago por $${Number(due.amount).toFixed(2)} ha sido verificado y aprobado con éxito.`,
        type: 'success',
        link: '/dues',
      });
    } catch (e) {
      console.warn('Error sending notification:', e);
    }

    toast.success('¡Alícuota aprobada con 1-click!');
    if (selectedReceiptDue?.id === due.id) setSelectedReceiptDue(null);
    setActionLoadingId(null);
    fetchData();
  };

  // RECHAZAR RECIBO CON 1-CLICK
  const handleRejectDue = async (due: Due) => {
    setActionLoadingId(due.id);

    const { error } = await supabase
      .from('dues')
      .update({ 
        status: 'pending',
        receipt_url: null,
        rejection_reason: 'Comprobante no válido o ilegible'
      })
      .eq('id', due.id);

    if (error) {
      toast.error('Error al rechazar alícuota: ' + error.message);
      setActionLoadingId(null);
      return;
    }

    // Notificar al residente
    try {
      await supabase.from('notifications').insert({
        user_id: due.user_id,
        title: `Comprobante rechazado - ${MONTHS[due.month - 1]} ${due.year}`,
        message: `El comprobante subido no pudo ser validado. Por favor sube una captura clara de tu transferencia.`,
        type: 'warning',
        link: '/dues',
      });
    } catch (e) {
      console.warn('Error sending notification:', e);
    }

    toast.warning('Comprobante rechazado. Se notificó al residente.');
    if (selectedReceiptDue?.id === due.id) setSelectedReceiptDue(null);
    setActionLoadingId(null);
    fetchData();
  };

  // Reabrir cuota
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
    if (!typeName || !typeFee) { toast.error('Nombre y monto son requeridos'); return; }

    if (editingType) {
      const { error } = await supabase.from('apartment_types').update({
        name: typeName, monthly_fee: Number(typeFee), description: typeDesc || null,
      }).eq('id', editingType.id);
      if (error) { toast.error('Error al actualizar'); return; }
      toast.success('Tipo actualizado');
    } else {
      const { error } = await supabase.from('apartment_types').insert({
        name: typeName, monthly_fee: Number(typeFee), description: typeDesc || null,
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
    if (error) { toast.error('Error al eliminar. Puede tener alícuotas asociadas.'); return; }
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

    // In-app notifications
    for (const resident of residentsWithTypes) {
      const aptType = apartmentTypes.find(t => t.id === resident.apartment_type_id);
      if (!aptType) continue;
      await supabase.from('notifications').insert({
        user_id: resident.id,
        title: `Nueva alícuota - ${MONTHS[month - 1]} ${year}`,
        message: `Se ha generado tu alícuota mensual por $${aptType.monthly_fee.toFixed(2)}.`,
        type: 'info',
        link: '/dues',
      });
    }

    setGenerating(false);
    toast.success(`${created} alícuotas generadas, ${skipped} ya existían`);
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
    return p?.apartment_number ? `Apt ${p.apartment_number}` : '-';
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
      <div className="space-y-8">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-3">
            <DollarSign className="w-8 h-8 text-primary" />
            Gestión y Verificación de Alícuotas
          </h1>
          <p className="text-muted-foreground mt-1">
            Comprueba recibos con 1-click, administra alícuotas mensuales y configura tipos de unidades
          </p>
        </div>

        <Tabs defaultValue="dues" className="space-y-6">
          <TabsList className="bg-muted/50 p-1 rounded-2xl">
            <TabsTrigger value="dues" className="rounded-xl font-bold">Alícuotas y Recibos</TabsTrigger>
            <TabsTrigger value="types" className="rounded-xl font-bold">Tipos de Apartamento</TabsTrigger>
            <TabsTrigger value="generate" className="rounded-xl font-bold">Generar Masivo</TabsTrigger>
          </TabsList>

          {/* DUES TAB */}
          <TabsContent value="dues" className="space-y-6">
            {/* Filter */}
            <div className="flex flex-wrap gap-4 items-center bg-card p-4 rounded-2xl border shadow-sm">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Mes:</Label>
                <Select value={filterMonth} onValueChange={setFilterMonth}>
                  <SelectTrigger className="w-40 rounded-xl font-bold"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Año:</Label>
                <Input type="number" value={filterYear} onChange={e => setFilterYear(e.target.value)} className="w-28 rounded-xl font-bold" />
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard title="Total Generado" value={`$${summary.total.toFixed(2)}`} icon={DollarSign} variant="default" />
              <StatCard title="Cobrado" value={`$${summary.paid.toFixed(2)}`} icon={CheckCircle} variant="success" />
              <StatCard title="Pendiente" value={`$${summary.pending.toFixed(2)}`} icon={Clock} variant="warning" />
              <StatCard title="Vencido" value={`$${summary.overdue.toFixed(2)}`} icon={AlertCircle} variant="destructive" />
            </div>

            {/* Dues Table */}
            <Card className="card-elevated border-none shadow-xl overflow-hidden">
              <CardHeader className="bg-muted/20 border-b">
                <CardTitle className="text-xl font-black">
                  Alícuotas - {MONTHS[Number(filterMonth) - 1]} {filterYear}
                </CardTitle>
                <CardDescription>
                  Verifica comprobantes bancarios y aprueba o rechaza pagos con un solo click
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                ) : dues.length === 0 ? (
                  <p className="text-center py-16 text-muted-foreground font-medium">No hay alícuotas registradas para este período</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border/50 bg-muted/30">
                          <th className="text-left py-4 px-6 text-xs font-black text-muted-foreground uppercase tracking-wider">Residente</th>
                          <th className="text-left py-4 px-6 text-xs font-black text-muted-foreground uppercase tracking-wider">Apto</th>
                          <th className="text-left py-4 px-6 text-xs font-black text-muted-foreground uppercase tracking-wider">Monto</th>
                          <th className="text-left py-4 px-6 text-xs font-black text-muted-foreground uppercase tracking-wider">Estado</th>
                          <th className="text-left py-4 px-6 text-xs font-black text-muted-foreground uppercase tracking-wider">Comprobante</th>
                          <th className="text-left py-4 px-6 text-xs font-black text-muted-foreground uppercase tracking-wider">Verificación 1-Click</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dues.map(due => {
                          const isLoading = actionLoadingId === due.id;
                          return (
                            <tr key={due.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                              <td className="py-4 px-6 font-bold text-foreground">
                                {getProfileName(due.user_id)}
                              </td>
                              <td className="py-4 px-6 font-medium text-muted-foreground">
                                {getProfileApt(due.user_id)}
                              </td>
                              <td className="py-4 px-6 font-black text-lg text-foreground">
                                ${Number(due.amount).toFixed(2)}
                              </td>
                              <td className="py-4 px-6">
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

                              {/* Columna Comprobante */}
                              <td className="py-4 px-6">
                                {due.receipt_url ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setSelectedReceiptDue(due)}
                                    className="gap-1.5 rounded-xl text-xs font-bold border-primary/30 text-primary hover:bg-primary/10"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    Ver Recibo
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground/60 font-medium italic">
                                    Sin comprobante
                                  </span>
                                )}
                              </td>

                              {/* Columna Acciones 1-Click */}
                              <td className="py-4 px-6">
                                <div className="flex items-center gap-2">
                                  {due.status !== 'paid' ? (
                                    <>
                                      <Button
                                        size="sm"
                                        disabled={isLoading}
                                        onClick={() => handleApproveDue(due)}
                                        className="gap-1.5 rounded-xl font-black text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 active:scale-95 transition-all"
                                      >
                                        {isLoading ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <Check className="w-3.5 h-3.5" />
                                        )}
                                        Aprobar
                                      </Button>

                                      {due.receipt_url && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          disabled={isLoading}
                                          onClick={() => handleRejectDue(due)}
                                          className="gap-1 rounded-xl font-bold text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 active:scale-95"
                                        >
                                          <XCircle className="w-3.5 h-3.5" />
                                          Rechazar
                                        </Button>
                                      )}
                                    </>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                                        <CheckCircle className="w-3.5 h-3.5" />
                                        Verificado
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={isLoading}
                                        onClick={() => handleReopenDue(due.id)}
                                        className="text-[10px] text-muted-foreground hover:text-foreground h-7 px-2 font-bold"
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
              </CardContent>
            </Card>
          </TabsContent>

          {/* APARTMENT TYPES TAB */}
          <TabsContent value="types" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-black">Tipos de Apartamento</h2>
              <Dialog open={showTypeDialog} onOpenChange={(open) => {
                setShowTypeDialog(open);
                if (!open) { setEditingType(null); setTypeName(''); setTypeFee(''); setTypeDesc(''); }
              }}>
                <DialogTrigger asChild>
                  <Button className="rounded-xl font-bold"><Plus className="w-4 h-4 mr-2" />Agregar Tipo</Button>
                </DialogTrigger>
                <DialogContent className="rounded-2xl">
                  <DialogHeader>
                    <DialogTitle>{editingType ? 'Editar' : 'Nuevo'} Tipo de Apartamento</DialogTitle>
                    <DialogDescription>Define el nombre y la cuota mensual de mantenimiento</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div>
                      <Label>Nombre *</Label>
                      <Input value={typeName} onChange={e => setTypeName(e.target.value)} placeholder="Ej: 2 Habitaciones" className="rounded-xl" />
                    </div>
                    <div>
                      <Label>Cuota Mensual ($) *</Label>
                      <Input type="number" value={typeFee} onChange={e => setTypeFee(e.target.value)} placeholder="50.00" className="rounded-xl" />
                    </div>
                    <div>
                      <Label>Descripción (opcional)</Label>
                      <Input value={typeDesc} onChange={e => setTypeDesc(e.target.value)} placeholder="Descripción del tipo" className="rounded-xl" />
                    </div>
                    <Button onClick={handleSaveType} className="w-full rounded-xl font-bold">
                      {editingType ? 'Actualizar' : 'Crear'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {apartmentTypes.map(type => (
                <Card key={type.id} className="card-elevated border-none shadow-md">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2 font-black">
                          <Building className="w-5 h-5 text-primary" />{type.name}
                        </CardTitle>
                        {type.description && <CardDescription>{type.description}</CardDescription>}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => {
                          setEditingType(type);
                          setTypeName(type.name);
                          setTypeFee(String(type.monthly_fee));
                          setTypeDesc(type.description || '');
                          setShowTypeDialog(true);
                        }}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteType(type.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-black text-primary">${Number(type.monthly_fee).toFixed(2)}<span className="text-xs text-muted-foreground font-normal">/mes</span></p>
                  </CardContent>
                </Card>
              ))}
              {apartmentTypes.length === 0 && (
                <p className="text-muted-foreground col-span-full text-center py-8">No hay tipos de apartamento. Crea uno para comenzar.</p>
              )}
            </div>
          </TabsContent>

          {/* GENERATE TAB */}
          <TabsContent value="generate" className="space-y-6">
            <Card className="card-elevated border-none shadow-xl max-w-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-black"><Send className="w-5 h-5 text-primary" />Generar Alícuotas Mensuales</CardTitle>
                <CardDescription>Genera automáticamente las alícuotas para todos los residentes con tipo de apartamento asignado</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Mes</Label>
                  <Select value={genMonth} onValueChange={setGenMonth}>
                    <SelectTrigger className="rounded-xl font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Año</Label>
                  <Input type="number" value={genYear} onChange={e => setGenYear(e.target.value)} className="rounded-xl font-bold" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">
                  {profiles.filter(p => p.apartment_type_id).length} residentes con tipo de unidad asignado
                </p>
                <Button onClick={handleGenerateDues} disabled={generating} className="w-full rounded-xl font-black h-12 shadow-lg">
                  {generating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generando...</> : 'Generar Alícuotas'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal de Previsualización y Verificación de Recibo */}
        <Dialog open={!!selectedReceiptDue} onOpenChange={(open) => !open && setSelectedReceiptDue(null)}>
          <DialogContent className="max-w-2xl rounded-2xl p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-black">
                <FileText className="w-5 h-5 text-primary" />
                Comprobante de Pago — {selectedReceiptDue ? getProfileName(selectedReceiptDue.user_id) : ''}
              </DialogTitle>
              <DialogDescription>
                {selectedReceiptDue ? `${MONTHS[selectedReceiptDue.month - 1]} ${selectedReceiptDue.year} — Monto: $${Number(selectedReceiptDue.amount).toFixed(2)}` : ''}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 flex justify-center bg-black/5 dark:bg-black/30 rounded-2xl p-4 overflow-hidden max-h-[65vh]">
              {selectedReceiptDue?.receipt_url?.endsWith('.pdf') ? (
                <iframe src={selectedReceiptDue.receipt_url} className="w-full h-96 rounded-xl" title="Comprobante PDF" />
              ) : (
                <img 
                  src={selectedReceiptDue?.receipt_url || ''} 
                  alt="Comprobante" 
                  className="max-h-[55vh] max-w-full object-contain rounded-xl shadow-lg" 
                />
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border/50">
              <Button variant="outline" onClick={() => setSelectedReceiptDue(null)} className="rounded-xl font-bold">
                Cerrar
              </Button>

              {selectedReceiptDue && selectedReceiptDue.status !== 'paid' && (
                <div className="flex gap-2">
                  <Button 
                    variant="ghost"
                    onClick={() => handleRejectDue(selectedReceiptDue)}
                    disabled={actionLoadingId === selectedReceiptDue.id}
                    className="rounded-xl font-bold text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                  >
                    <XCircle className="w-4 h-4 mr-1.5" />
                    Rechazar
                  </Button>
                  <Button 
                    onClick={() => handleApproveDue(selectedReceiptDue)}
                    disabled={actionLoadingId === selectedReceiptDue.id}
                    className="rounded-xl font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20"
                  >
                    {actionLoadingId === selectedReceiptDue.id ? (
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

export default ManageDues;
