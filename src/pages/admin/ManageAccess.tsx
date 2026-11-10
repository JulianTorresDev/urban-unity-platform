import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { 
  QrCode, 
  Loader2, 
  Plus, 
  UserCheck, 
  Users, 
  LogIn, 
  LogOut, 
  Scan, 
  ShieldCheck, 
  Clock, 
  Check, 
  Copy,
  Calendar,
  KeyRound
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';

interface AccessCode {
  id: string;
  user_id: string | null;
  code: string;
  type: string;
  visitor_name: string | null;
  visitor_document: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_by: string;
  notes: string | null;
  created_at: string;
}

interface AccessLog {
  id: string;
  access_code_id: string;
  direction: string;
  scanned_by: string | null;
  created_at: string;
  access_codes?: AccessCode;
}

interface Profile {
  id: string;
  full_name: string | null;
  apartment_number: string | null;
  email: string;
}

const ManageAccess = () => {
  const { isAdmin, user } = useAuth();
  const [accessCodes, setAccessCodes] = useState<AccessCode[]>([]);
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [scanCode, setScanCode] = useState('');
  const [qrPreview, setQrPreview] = useState<AccessCode | null>(null);

  const [formType, setFormType] = useState<'resident' | 'visitor'>('visitor');
  const [formUserId, setFormUserId] = useState('');
  const [formVisitorName, setFormVisitorName] = useState('');
  const [formVisitorDoc, setFormVisitorDoc] = useState('');
  const [formExpiresHours, setFormExpiresHours] = useState('24');
  const [formNotes, setFormNotes] = useState('');
  const [creating, setCreating] = useState(false);

  // Generador criptográfico: Math.random() producía códigos predecibles
  const generateCode = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const random = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 8).toUpperCase();
    return `ACC-${random}`;
  };

  const fetchData = async () => {
    try {
      const [codesRes, logsRes, profilesRes] = await Promise.all([
        supabase.from('access_codes').select('*').order('created_at', { ascending: false }),
        supabase.from('access_logs').select('*, access_codes(*)').order('created_at', { ascending: false }).limit(100),
        supabase.from('profiles').select('id, full_name, apartment_number, email'),
      ]);
      setAccessCodes((codesRes.data as AccessCode[]) || []);
      setAccessLogs((logsRes.data as AccessLog[]) || []);
      setProfiles(profilesRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('access-logs-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'access_logs' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleCreate = async () => {
    if (!user) return;
    if (formType === 'visitor' && !formVisitorName.trim()) {
      toast.error('Escribe el nombre del visitante');
      return;
    }
    if (formType === 'resident' && !formUserId) {
      toast.error('Selecciona el residente');
      return;
    }
    const hours = parseInt(formExpiresHours);
    if (formType === 'visitor' && !(hours > 0 && hours <= 720)) {
      toast.error('La vigencia debe estar entre 1 y 720 horas');
      return;
    }
    setCreating(true);
    try {
      const code = generateCode();
      const expiresAt = formType === 'visitor' 
        ? new Date(Date.now() + parseInt(formExpiresHours) * 3600000).toISOString()
        : null;

      const { error } = await supabase.from('access_codes').insert({
        code,
        type: formType,
        user_id: formType === 'resident' ? formUserId : null,
        visitor_name: formType === 'visitor' ? formVisitorName.trim() : null,
        visitor_document: formType === 'visitor' ? formVisitorDoc.trim() || null : null,
        expires_at: expiresAt,
        is_active: true,
        created_by: user.id,
        notes: formNotes || null,
      });

      if (error) {
        toast.error('Error al emitir pase: ' + error.message);
      } else {
        toast.success('Pase de acceso generado correctamente');
        setCreateDialogOpen(false);
        resetForm();
        fetchData();
      }
    } catch (err) {
      toast.error('Error inesperado al crear pase');
    } finally {
      setCreating(false);
    }
  };

  const handleScan = async (direction: 'entry' | 'exit') => {
    if (!scanCode.trim()) return;
    const codeRecord = accessCodes.find(c => c.code === scanCode.trim());
    if (!codeRecord) {
      toast.error('Código no registrado');
      return;
    }
    if (!codeRecord.is_active) {
      toast.error('El código ha sido suspendido');
      return;
    }
    if (codeRecord.expires_at && new Date(codeRecord.expires_at) < new Date()) {
      toast.error('Este pase ha expirado');
      return;
    }

    try {
      const { error } = await supabase.from('access_logs').insert({
        access_code_id: codeRecord.id,
        direction,
        scanned_by: user?.id,
      });

      if (error) {
        toast.error('Error al registrar paso');
      } else {
        const ownerName = codeRecord.type === 'visitor' ? codeRecord.visitor_name : getProfileName(codeRecord.user_id);
        toast.success(`${direction === 'entry' ? 'Entrada' : 'Salida'} registrada: ${ownerName}`);
        setScanCode('');
        setScanDialogOpen(false);
        fetchData();
      }
    } catch (err) {
      toast.error('Error al registrar en bitácora');
    }
  };

  const toggleActive = async (code: AccessCode) => {
    await supabase.from('access_codes').update({ is_active: !code.is_active }).eq('id', code.id);
    fetchData();
  };

  const resetForm = () => {
    setFormType('visitor');
    setFormUserId('');
    setFormVisitorName('');
    setFormVisitorDoc('');
    setFormExpiresHours('24');
    setFormNotes('');
  };

  const getProfileName = (userId: string | null) => {
    if (!userId) return 'N/A';
    const p = profiles.find(pr => pr.id === userId);
    return p?.full_name || p?.email || 'Desconocido';
  };

  const residentCodes = accessCodes.filter(c => c.type === 'resident');
  const visitorCodes = accessCodes.filter(c => c.type === 'visitor');

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[13px] font-medium text-primary">
                Seguridad
              </span>
            </div>
            <h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold text-foreground tracking-tight">
              Pases de acceso
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base font-medium">
              Crea pases para visitantes y residentes, y revisa las entradas y salidas.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              onClick={() => setScanDialogOpen(true)}
              className="h-12 px-5 rounded-xl border font-semibold text-xs gap-2"
            >
              <Scan className="w-4 h-4 text-primary" />
              Validar manualmente
            </Button>
            <Button 
              onClick={() => setCreateDialogOpen(true)}
              className="h-12 px-6 rounded-xl font-semibold text-xs gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Nuevo pase QR
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-2xl bg-card shadow-hairline">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
            <p className="text-xs font-medium text-muted-foreground">Cargando credenciales y bitácora...</p>
          </div>
        ) : (
          <Tabs defaultValue="residents" className="w-full space-y-6">
            <TabsList className="grid w-full grid-cols-3 max-w-lg h-12 p-1 bg-muted/60 rounded-xl border border-border/80">
              <TabsTrigger value="residents" className="font-semibold text-xs rounded-lg gap-2">
                <UserCheck className="w-3.5 h-3.5" />
                Residentes ({residentCodes.length})
              </TabsTrigger>
              <TabsTrigger value="visitors" className="font-semibold text-xs rounded-lg gap-2">
                <Users className="w-3.5 h-3.5" />
                Visitantes ({visitorCodes.length})
              </TabsTrigger>
              <TabsTrigger value="logs" className="font-semibold text-xs rounded-lg gap-2">
                <Clock className="w-3.5 h-3.5" />
                Bitácora ({accessLogs.length})
              </TabsTrigger>
            </TabsList>

            {/* Resident Pass List */}
            <TabsContent value="residents" className="space-y-4">
              <div className="rounded-2xl bg-card overflow-hidden shadow-hairline">
                {residentCodes.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-xs font-medium">
                    No hay códigos de residentes registrados en este módulo.
                  </div>
                ) : (
                  <div className="divide-y-2 divide-border/60">
                    {residentCodes.map(code => (
                      <div key={code.id} className="p-4 sm:p-5 flex items-center justify-between gap-4 hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-4">
                          <div 
                            className="p-2 bg-white rounded-xl border border-border shadow-xs cursor-pointer transition-transform"
                            onClick={() => setQrPreview(code)}
                            title="Ampliar código QR"
                          >
                            <QRCodeSVG value={code.code} size={44} />
                          </div>
                          <div>
                            <p className="font-semibold text-base text-foreground leading-snug">{getProfileName(code.user_id)}</p>
                            <p className="text-xs font-mono font-medium text-muted-foreground tracking-wider mt-0.5">{code.code}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <StatusBadge status={code.is_active ? 'success' : 'destructive'}>
                            {code.is_active ? 'Activo' : 'Inactivo'}
                          </StatusBadge>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => toggleActive(code)}
                            className="h-9 px-4 rounded-xl border font-semibold text-xs"
                          >
                            {code.is_active ? 'Desactivar' : 'Activar'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Visitor Pass List */}
            <TabsContent value="visitors" className="space-y-4">
              <div className="rounded-2xl bg-card overflow-hidden shadow-hairline">
                {visitorCodes.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-xs font-medium">
                    No hay pases de visitantes activos en este momento.
                  </div>
                ) : (
                  <div className="divide-y-2 divide-border/60">
                    {visitorCodes.map(code => {
                      const expired = code.expires_at && new Date(code.expires_at) < new Date();
                      return (
                        <div key={code.id} className="p-4 sm:p-5 flex items-center justify-between gap-4 hover:bg-muted/20 transition-colors">
                          <div className="flex items-center gap-4">
                            <div 
                              className="p-2 bg-white rounded-xl border border-border shadow-xs cursor-pointer transition-transform"
                              onClick={() => setQrPreview(code)}
                              title="Ampliar código QR"
                            >
                              <QRCodeSVG value={code.code} size={44} />
                            </div>
                            <div>
                              <p className="font-semibold text-base text-foreground leading-snug">{code.visitor_name}</p>
                              <p className="text-xs font-medium text-muted-foreground">Doc: {code.visitor_document || 'S/N'}</p>
                              {code.expires_at && (
                                <p className="text-xs font-medium text-muted-foreground mt-0.5">
                                  Vence: {format(new Date(code.expires_at), "d MMM, HH:mm", { locale: es })}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <StatusBadge status={expired ? 'destructive' : code.is_active ? 'success' : 'warning'}>
                              {expired ? 'Expirado' : code.is_active ? 'Válido' : 'Suspendido'}
                            </StatusBadge>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => toggleActive(code)}
                              className="h-9 px-4 rounded-xl border font-semibold text-xs"
                            >
                              {code.is_active ? 'Desactivar' : 'Activar'}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Access Logs */}
            <TabsContent value="logs" className="space-y-4">
              <div className="rounded-2xl bg-card overflow-hidden shadow-hairline">
                {accessLogs.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-xs font-medium">
                    No se registran pasos en la bitácora central.
                  </div>
                ) : (
                  <div className="divide-y-2 divide-border/60">
                    {accessLogs.map(log => (
                      <div key={log.id} className="p-4 sm:p-5 flex items-center justify-between gap-4 hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                            log.direction === 'entry' 
                              ? 'bg-success/10 text-success border-success/30' 
                              : 'bg-warning/10 text-warning border-warning/30'
                          }`}>
                            {log.direction === 'entry' ? <LogIn className="w-5 h-5" /> : <LogOut className="w-5 h-5" />}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-foreground">
                              {log.direction === 'entry' ? 'Ingreso autorizado' : 'Salida registrada'}
                            </p>
                            <p className="text-xs font-mono font-medium text-muted-foreground mt-0.5">
                              {log.access_codes?.code || 'Pase general'}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-xs font-semibold text-foreground">
                            {format(new Date(log.created_at), "d 'de' MMMM", { locale: es })}
                          </p>
                          <p className="text-xs font-medium text-muted-foreground">
                            {format(new Date(log.created_at), 'hh:mm:ss a')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}

        {/* Modal: Create Access Pass */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="sm:max-w-lg rounded-2xl bg-card p-6 sm:p-8">
            <DialogHeader className="border-b border-border/70 pb-4">
              <DialogTitle className="text-2xl font-semibold text-foreground">Emitir nuevo pase QR</DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm font-medium">
                Genera un código QR de acceso para visitantes temporales o residentes del conjunto.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="manage-access-tipo-de-pase" className="text-xs font-semibold text-foreground">Tipo de pase *</Label>
                <Select value={formType} onValueChange={(val) => setFormType(val as 'resident' | 'visitor')}>
                  <SelectTrigger id="manage-access-tipo-de-pase" className="h-12 border border-border/80 rounded-xl bg-background font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border border-border bg-card">
                    <SelectItem value="visitor">Visitante temporal</SelectItem>
                    <SelectItem value="resident">Residente permanente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formType === 'visitor' ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="manage-access-nombre-del-visitante" className="text-xs font-semibold text-foreground">Nombre del visitante *</Label>
                    <Input id="manage-access-nombre-del-visitante"
                      value={formVisitorName}
                      onChange={(e) => setFormVisitorName(e.target.value)}
                      placeholder="Ej: Juan Sebastián Ruiz"
                      className="h-12 border border-border/80 rounded-xl bg-background font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="manage-access-documento-de-identidad" className="text-xs font-semibold text-foreground">Documento de identidad</Label>
                      <Input id="manage-access-documento-de-identidad"
                        value={formVisitorDoc}
                        onChange={(e) => setFormVisitorDoc(e.target.value)}
                        placeholder="Cédula o pasaporte"
                        className="h-12 border border-border/80 rounded-xl bg-background font-semibold"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="manage-access-vigencia-horas" className="text-xs font-semibold text-foreground">Vigencia (Horas)</Label>
                      <Select value={formExpiresHours} onValueChange={setFormExpiresHours}>
                        <SelectTrigger id="manage-access-vigencia-horas" className="h-12 border border-border/80 rounded-xl bg-background font-semibold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border border-border bg-card">
                          <SelectItem value="4">4 horas</SelectItem>
                          <SelectItem value="12">12 horas</SelectItem>
                          <SelectItem value="24">24 horas</SelectItem>
                          <SelectItem value="48">48 horas</SelectItem>
                          <SelectItem value="168">7 días</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="manage-access-seleccionar-residente" className="text-xs font-semibold text-foreground">Seleccionar residente *</Label>
                  <Select value={formUserId} onValueChange={setFormUserId}>
                    <SelectTrigger id="manage-access-seleccionar-residente" className="h-12 border border-border/80 rounded-xl bg-background font-semibold">
                      <SelectValue placeholder="Elige un residente..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border border-border bg-card">
                      {profiles.map(p => (
                        <SelectItem key={p.id} value={p.id} className="py-2.5 font-semibold">
                          {p.full_name || p.email} {p.apartment_number ? `(Apto ${p.apartment_number})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="manage-access-notas-u-observaciones-opcional" className="text-xs font-semibold text-foreground">Notas u observaciones (Opcional)</Label>
                <Textarea id="manage-access-notas-u-observaciones-opcional"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Ej: Contratista de plomería, mudanza, entrega..."
                  rows={2}
                  className="border border-border/80 rounded-xl bg-background font-medium resize-none text-sm"
                />
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-border/70">
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)} className="rounded-xl font-semibold border w-full sm:w-auto h-12">
                  Cancelar
                </Button>
                <Button 
                  onClick={handleCreate} 
                  disabled={creating || (formType === 'visitor' && !formVisitorName.trim()) || (formType === 'resident' && !formUserId)} 
                  className="rounded-xl font-semibold shadow-sm w-full sm:w-auto h-12 px-8"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Generar pase'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal: Manual Code Check */}
        <Dialog open={scanDialogOpen} onOpenChange={setScanDialogOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl bg-card p-6">
            <DialogHeader className="border-b border-border/70 pb-4">
              <DialogTitle className="text-xl font-semibold text-foreground">Validación manual de pase</DialogTitle>
              <DialogDescription className="text-xs font-medium text-muted-foreground">
                Ingresa el código alfanumérico reportado por el visitante o residente en portería.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="manage-access-codigo-de-pase" className="text-xs font-semibold text-foreground">Código de pase</Label>
                <Input id="manage-access-codigo-de-pase"
                  value={scanCode}
                  onChange={(e) => setScanCode(e.target.value)}
                  placeholder="Ej: ACC-7K2M9QXA"
                  className="h-12 border border-border/80 rounded-xl bg-background font-mono font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button 
                  onClick={() => handleScan('entry')} 
                  disabled={!scanCode.trim()} 
                  className="h-12 rounded-xl font-semibold text-xs gap-2 bg-success hover:bg-success/90 text-success-foreground"
                >
                  <LogIn className="w-4 h-4" />
                  Registrar entrada
                </Button>
                <Button 
                  onClick={() => handleScan('exit')} 
                  disabled={!scanCode.trim()} 
                  variant="outline" 
                  className="h-12 rounded-xl font-semibold text-xs gap-2 border text-warning border-warning/40 hover:bg-warning/10"
                >
                  <LogOut className="w-4 h-4" />
                  Registrar salida
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal: QR Viewer */}
        <Dialog open={!!qrPreview} onOpenChange={(open) => !open && setQrPreview(null)}>
          <DialogContent className="sm:max-w-sm rounded-2xl bg-card p-6 text-center">
            <DialogHeader className="text-center">
              <DialogTitle className="text-xl font-semibold text-foreground">Credencial de paso</DialogTitle>
              <DialogDescription className="text-xs font-medium text-muted-foreground">
                {qrPreview?.type === 'visitor' ? qrPreview.visitor_name : getProfileName(qrPreview?.user_id || null)}
              </DialogDescription>
            </DialogHeader>

            {qrPreview && (
              <div className="py-6 flex flex-col items-center space-y-4">
                <div className="p-4 bg-white rounded-2xl border border-border shadow-md">
                  <QRCodeSVG value={qrPreview.code} size={200} />
                </div>
                <p className="font-mono text-sm font-semibold text-foreground tracking-wider">{qrPreview.code}</p>
                <StatusBadge status={qrPreview.is_active ? 'success' : 'destructive'}>
                  {qrPreview.is_active ? 'Activo' : 'Inactivo'}
                </StatusBadge>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default ManageAccess;
