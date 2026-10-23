import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { QrCode, Loader2, Plus, UserCheck, Users, LogIn, LogOut, Scan } from 'lucide-react';
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

  // Form state
  const [formType, setFormType] = useState<'resident' | 'visitor'>('visitor');
  const [formUserId, setFormUserId] = useState('');
  const [formVisitorName, setFormVisitorName] = useState('');
  const [formVisitorDoc, setFormVisitorDoc] = useState('');
  const [formExpiresHours, setFormExpiresHours] = useState('24');
  const [formNotes, setFormNotes] = useState('');
  const [creating, setCreating] = useState(false);

  const generateCode = () => {
    return `ACC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  };

  const fetchData = async () => {
    const [codesRes, logsRes, profilesRes] = await Promise.all([
      supabase.from('access_codes').select('*').order('created_at', { ascending: false }),
      supabase.from('access_logs').select('*, access_codes(*)').order('created_at', { ascending: false }).limit(100),
      supabase.from('profiles').select('id, full_name, apartment_number, email'),
    ]);
    setAccessCodes((codesRes.data as AccessCode[]) || []);
    setAccessLogs((logsRes.data as AccessLog[]) || []);
    setProfiles(profilesRes.data || []);
    setLoading(false);
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
    setCreating(true);
    const code = generateCode();
    const expiresAt = formType === 'visitor' 
      ? new Date(Date.now() + parseInt(formExpiresHours) * 3600000).toISOString()
      : null;

    const { error } = await supabase.from('access_codes').insert({
      code,
      type: formType,
      user_id: formType === 'resident' ? formUserId : null,
      visitor_name: formType === 'visitor' ? formVisitorName : null,
      visitor_document: formType === 'visitor' ? formVisitorDoc : null,
      expires_at: expiresAt,
      is_active: true,
      created_by: user.id,
      notes: formNotes || null,
    });

    if (error) {
      toast.error('Error al crear código: ' + error.message);
    } else {
      toast.success('Código QR creado exitosamente');
      setCreateDialogOpen(false);
      resetForm();
      fetchData();
    }
    setCreating(false);
  };

  const handleScan = async (direction: 'entry' | 'exit') => {
    if (!scanCode.trim()) return;
    const codeRecord = accessCodes.find(c => c.code === scanCode.trim());
    if (!codeRecord) {
      toast.error('Código no encontrado');
      return;
    }
    if (!codeRecord.is_active) {
      toast.error('Código inactivo');
      return;
    }
    if (codeRecord.expires_at && new Date(codeRecord.expires_at) < new Date()) {
      toast.error('Código expirado');
      return;
    }

    const { error } = await supabase.from('access_logs').insert({
      access_code_id: codeRecord.id,
      direction,
      scanned_by: user?.id,
    });

    if (error) {
      toast.error('Error al registrar acceso');
    } else {
      const ownerName = codeRecord.type === 'visitor' ? codeRecord.visitor_name : getProfileName(codeRecord.user_id);
      toast.success(`${direction === 'entry' ? 'Entrada' : 'Salida'} registrada: ${ownerName}`);

      // Send notification to resident if the code belongs to one
      if (codeRecord.user_id) {
        const profile = profiles.find(p => p.id === codeRecord.user_id);
        if (profile) {
          try {
            await supabase.functions.invoke('send-notification', {
              body: {
                type: 'access_registered',
                recipientEmail: profile.email,
                recipientName: profile.full_name,
                accessDirection: direction,
                accessPersonName: ownerName,
                accessType: codeRecord.type,
              },
            });
          } catch (e) {
            console.error('Failed to send access notification:', e);
          }
          // In-app notification
          const dirLabel = direction === 'entry' ? 'Entrada' : 'Salida';
          await supabase.from('notifications').insert({
            user_id: codeRecord.user_id,
            title: `${direction === 'entry' ? '🟢' : '🔴'} ${dirLabel} registrada`,
            message: codeRecord.type === 'visitor'
              ? `Visitante: ${ownerName} (${dirLabel.toLowerCase()})`
              : `Se registró tu ${dirLabel.toLowerCase()} al complejo.`,
            type: 'info',
            link: '/my-access',
          });
        }
      }

      setScanCode('');
      setScanDialogOpen(false);
      fetchData();
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

  if (!isAdmin) {
    return <DashboardLayout><div className="text-center py-12"><h2 className="text-xl font-semibold">Acceso Denegado</h2></div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold flex items-center gap-3">
              <QrCode className="w-8 h-8 text-primary" />
              Control de Accesos QR
            </h1>
            <p className="text-muted-foreground mt-1">Gestión de códigos QR para residentes y visitantes</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setScanDialogOpen(true)}>
              <Scan className="w-4 h-4 mr-2" />
              Registrar Acceso
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Código
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <Tabs defaultValue="residents" className="w-full">
            <TabsList className="grid w-full grid-cols-3 max-w-lg">
              <TabsTrigger value="residents"><UserCheck className="w-4 h-4 mr-1" /> Residentes</TabsTrigger>
              <TabsTrigger value="visitors"><Users className="w-4 h-4 mr-1" /> Visitantes</TabsTrigger>
              <TabsTrigger value="logs">Registro</TabsTrigger>
            </TabsList>

            <TabsContent value="residents" className="mt-6">
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle>Códigos de Residentes</CardTitle>
                  <CardDescription>QR permanentes asignados a residentes</CardDescription>
                </CardHeader>
                <CardContent>
                  {residentCodes.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No hay códigos de residentes creados</p>
                  ) : (
                    <div className="space-y-3">
                      {residentCodes.map(code => (
                        <div key={code.id} className="flex items-center justify-between p-4 rounded-lg border border-border/50">
                          <div className="flex items-center gap-4">
                            <div className="cursor-pointer" onClick={() => setQrPreview(code)}>
                              <QRCodeSVG value={code.code} size={48} />
                            </div>
                            <div>
                              <p className="font-semibold">{getProfileName(code.user_id)}</p>
                              <p className="text-sm text-muted-foreground font-mono">{code.code}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusBadge status={code.is_active ? 'success' : 'destructive'}>
                              {code.is_active ? 'Activo' : 'Inactivo'}
                            </StatusBadge>
                            <Button variant="ghost" size="sm" onClick={() => toggleActive(code)}>
                              {code.is_active ? 'Desactivar' : 'Activar'}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="visitors" className="mt-6">
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle>Códigos de Visitantes</CardTitle>
                  <CardDescription>QR temporales para visitantes</CardDescription>
                </CardHeader>
                <CardContent>
                  {visitorCodes.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No hay códigos de visitantes</p>
                  ) : (
                    <div className="space-y-3">
                      {visitorCodes.map(code => {
                        const expired = code.expires_at && new Date(code.expires_at) < new Date();
                        return (
                          <div key={code.id} className="flex items-center justify-between p-4 rounded-lg border border-border/50">
                            <div className="flex items-center gap-4">
                              <div className="cursor-pointer" onClick={() => setQrPreview(code)}>
                                <QRCodeSVG value={code.code} size={48} />
                              </div>
                              <div>
                                <p className="font-semibold">{code.visitor_name}</p>
                                <p className="text-sm text-muted-foreground">Doc: {code.visitor_document || 'N/A'}</p>
                                {code.expires_at && (
                                  <p className="text-xs text-muted-foreground">
                                    Expira: {format(new Date(code.expires_at), "d MMM yyyy, HH:mm", { locale: es })}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status={expired ? 'destructive' : code.is_active ? 'success' : 'warning'}>
                                {expired ? 'Expirado' : code.is_active ? 'Activo' : 'Inactivo'}
                              </StatusBadge>
                              <Button variant="ghost" size="sm" onClick={() => toggleActive(code)}>
                                {code.is_active ? 'Desactivar' : 'Activar'}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="logs" className="mt-6">
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle>Registro de Accesos</CardTitle>
                  <CardDescription>Últimos 100 registros de entrada/salida</CardDescription>
                </CardHeader>
                <CardContent>
                  {accessLogs.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Sin registros</p>
                  ) : (
                    <div className="space-y-2">
                      {accessLogs.map(log => (
                        <div key={log.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                          <div className="flex items-center gap-3">
                            {log.direction === 'entry' ? (
                              <LogIn className="w-5 h-5 text-green-500" />
                            ) : (
                              <LogOut className="w-5 h-5 text-orange-500" />
                            )}
                            <div>
                              <p className="font-medium">
                                {log.access_codes?.type === 'visitor' 
                                  ? log.access_codes?.visitor_name 
                                  : getProfileName(log.access_codes?.user_id || null)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {log.access_codes?.type === 'visitor' ? 'Visitante' : 'Residente'} • {log.access_codes?.code}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <StatusBadge status={log.direction === 'entry' ? 'success' : 'warning'}>
                              {log.direction === 'entry' ? 'Entrada' : 'Salida'}
                            </StatusBadge>
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(new Date(log.created_at), "d MMM, HH:mm", { locale: es })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Create Code Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Código QR</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo</Label>
              <Select value={formType} onValueChange={(v) => setFormType(v as 'resident' | 'visitor')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="resident">Residente</SelectItem>
                  <SelectItem value="visitor">Visitante</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formType === 'resident' ? (
              <div>
                <Label>Residente</Label>
                <Select value={formUserId} onValueChange={setFormUserId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar residente" /></SelectTrigger>
                  <SelectContent>
                    {profiles.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name || p.email} {p.apartment_number ? `(Apto ${p.apartment_number})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div>
                  <Label>Nombre del visitante</Label>
                  <Input value={formVisitorName} onChange={e => setFormVisitorName(e.target.value)} />
                </div>
                <div>
                  <Label>Documento de identidad</Label>
                  <Input value={formVisitorDoc} onChange={e => setFormVisitorDoc(e.target.value)} />
                </div>
                <div>
                  <Label>Expiración (horas)</Label>
                  <Select value={formExpiresHours} onValueChange={setFormExpiresHours}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">4 horas</SelectItem>
                      <SelectItem value="8">8 horas</SelectItem>
                      <SelectItem value="24">24 horas</SelectItem>
                      <SelectItem value="48">48 horas</SelectItem>
                      <SelectItem value="72">72 horas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div>
              <Label>Notas (opcional)</Label>
              <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating || (formType === 'resident' && !formUserId) || (formType === 'visitor' && !formVisitorName)}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Crear Código
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scan Dialog */}
      <Dialog open={scanDialogOpen} onOpenChange={setScanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Acceso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Código de acceso</Label>
              <Input value={scanCode} onChange={e => setScanCode(e.target.value)} placeholder="Ingrese o escanee el código" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleScan('exit')}>
              <LogOut className="w-4 h-4 mr-2" /> Salida
            </Button>
            <Button onClick={() => handleScan('entry')}>
              <LogIn className="w-4 h-4 mr-2" /> Entrada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Preview Dialog */}
      <Dialog open={!!qrPreview} onOpenChange={() => setQrPreview(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {qrPreview?.type === 'visitor' ? qrPreview?.visitor_name : getProfileName(qrPreview?.user_id || null)}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {qrPreview && <QRCodeSVG value={qrPreview.code} size={256} />}
            <p className="font-mono text-sm text-muted-foreground">{qrPreview?.code}</p>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default ManageAccess;
