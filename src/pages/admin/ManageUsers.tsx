import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Users, Loader2, Shield, UserCircle, Plus, ShieldCheck, ShieldAlert, QrCode, CreditCard, Search } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { motion } from 'framer-motion';

interface ApartmentType {
  id: string;
  name: string;
  monthly_fee: number;
}

interface UserWithRole {
  id: string;
  email: string;
  full_name: string | null;
  apartment_number: string | null;
  phone: string | null;
  nfc_card_id: string | null;
  status: string;
  created_at: string;
  role: 'super_admin' | 'admin' | 'resident';
  access_token?: string | null;
}

const ManageUsers = () => {
  const { isSuperAdmin, isAdmin, user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [apartmentTypes, setApartmentTypes] = useState<ApartmentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Create user dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserApartment, setNewUserApartment] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserNfc, setNewUserNfc] = useState('');

  // QR dialog
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [selectedUserQR, setSelectedUserQR] = useState<UserWithRole | null>(null);

  const fetchUsers = async () => {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, full_name, apartment_number, phone, nfc_card_id, status, created_at');

    if (profilesError) {
      toast.error('Error al cargar perfiles');
      setLoading(false);
      return;
    }

    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, role');

    const { data: tokens } = await supabase
      .from('access_tokens')
      .select('user_id, token')
      .eq('type', 'permanent');

    const rolesMap = new Map(roles?.map((r) => [r.user_id, r.role as any]));
    const tokensMap = new Map(tokens?.map((t) => [t.user_id, t.token]));

    const usersWithRoles: UserWithRole[] = (profiles || []).map((p: any) => ({
      ...p,
      role: rolesMap.get(p.id) || 'resident',
      access_token: tokensMap.get(p.id) || null,
    }));

    setUsers(usersWithRoles);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || !newUserEmail || !newUserPassword) {
      toast.error('Nombre, correo y contraseña son obligatorios');
      return;
    }

    setIsCreating(true);
    try {
      // Create auth user via Supabase signUp (creates profile via trigger)
      const { data, error } = await supabase.auth.signUp({
        email: newUserEmail,
        password: newUserPassword,
        options: {
          data: { full_name: newUserName },
        }
      });

      if (error) throw error;
      if (!data.user) throw new Error('No se pudo crear el usuario');

      const userId = data.user.id;

      // Wait for the trigger to create the profile
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update profile with apartment and phone
      await supabase.from('profiles').update({
        apartment_number: newUserApartment || null,
        phone: newUserPhone || null,
        nfc_card_id: newUserNfc || null,
        status: 'active',
      } as any).eq('id', userId);

      // Generate permanent QR token
      const qrToken = Math.random().toString(36).substr(2, 12).toUpperCase();
      await supabase.from('access_tokens').insert({
        user_id: userId,
        domicile_id: newUserApartment || 'N/A',
        token: qrToken,
        type: 'permanent',
      } as any);

      toast.success(`Residente ${newUserName} creado con éxito`);
      setShowCreateDialog(false);
      resetCreateForm();
      fetchUsers();
    } catch (err: any) {
      console.error('Error creating user:', err);
      if (err.message?.includes('already registered')) {
        toast.error('Este correo ya está registrado');
      } else {
        toast.error('Error al crear el usuario: ' + (err.message || ''));
      }
    } finally {
      setIsCreating(false);
    }
  };

  const resetCreateForm = () => {
    setNewUserName('');
    setNewUserEmail('');
    setNewUserPassword('');
    setNewUserApartment('');
    setNewUserPhone('');
    setNewUserNfc('');
  };

  const toggleUserStatus = async (userId: string, currentStatus: string) => {
    if (userId === currentUser?.id) {
      toast.error('No puedes bloquearte a ti mismo');
      return;
    }
    setUpdatingId(userId);
    const newStatus = currentStatus === 'active' ? 'blocked' : 'active';

    const { error } = await supabase
      .from('profiles')
      .update({ status: newStatus } as any)
      .eq('id', userId);

    if (error) {
      toast.error('Error al cambiar el estado');
    } else {
      toast.success(newStatus === 'blocked' ? 'Usuario bloqueado' : 'Usuario desbloqueado');
      fetchUsers();
    }
    setUpdatingId(null);
  };

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'resident') => {
    if (userId === currentUser?.id) {
      toast.error("No puedes cambiar tu propio rol");
      return;
    }
    setUpdatingId(userId);
    await supabase.from('user_roles').delete().eq('user_id', userId);
    const { error } = await supabase.from('user_roles').insert({ user_id: userId, role: newRole });
    if (error) {
      toast.error('Error al actualizar el rol');
    } else {
      toast.success('Rol actualizado con éxito');
      fetchUsers();
    }
    setUpdatingId(null);
  };

  const showUserQR = (user: UserWithRole) => {
    setSelectedUserQR(user);
    setShowQRDialog(true);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'super_admin': return <StatusBadge status="destructive">Super Admin</StatusBadge>;
      case 'admin': return <StatusBadge status="primary">Admin</StatusBadge>;
      default: return <StatusBadge status="muted">Residente</StatusBadge>;
    }
  };

  const filteredUsers = users.filter(u => {
    const term = searchTerm.toLowerCase();
    return !term || 
      u.full_name?.toLowerCase().includes(term) || 
      u.email.toLowerCase().includes(term) || 
      u.apartment_number?.toLowerCase().includes(term);
  });

  const stats = {
    total: users.length,
    active: users.filter(u => u.status === 'active').length,
    blocked: users.filter(u => u.status === 'blocked').length,
    admins: users.filter(u => u.role === 'admin' || u.role === 'super_admin').length,
  };

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Card className="card-elevated p-8 text-center border-none shadow-2xl">
            <Shield className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h2 className="font-display text-2xl font-bold">Acceso Denegado</h2>
            <p className="text-muted-foreground mt-2">Solo los administradores pueden gestionar usuarios.</p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-10 max-w-6xl mx-auto pb-20">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h1 className="font-display text-4xl font-black flex items-center gap-4 text-foreground tracking-tight">
              <div className="p-3 bg-primary/10 rounded-2xl">
                <Users className="w-8 h-8 text-primary" />
              </div>
              Control de Acceso
            </h1>
            <p className="text-muted-foreground mt-2 text-lg font-medium">
              Gestiona residentes, estados y códigos QR de acceso
            </p>
          </div>
          <Button 
            onClick={() => setShowCreateDialog(true)} 
            className="rounded-2xl h-14 px-8 font-black text-lg shadow-xl shadow-primary/20 gap-3 active:scale-95 w-full md:w-auto"
          >
            <Plus className="w-6 h-6" />
            NUEVO RESIDENTE
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="card-elevated border-none bg-primary/5 p-5 text-center rounded-2xl">
            <p className="text-3xl font-black text-primary">{stats.total}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">Total</p>
          </Card>
          <Card className="card-elevated border-none bg-emerald-500/5 p-5 text-center rounded-2xl">
            <p className="text-3xl font-black text-emerald-500">{stats.active}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">Activos</p>
          </Card>
          <Card className="card-elevated border-none bg-rose-500/5 p-5 text-center rounded-2xl">
            <p className="text-3xl font-black text-rose-500">{stats.blocked}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">Bloqueados</p>
          </Card>
          <Card className="card-elevated border-none bg-amber-500/5 p-5 text-center rounded-2xl">
            <p className="text-3xl font-black text-amber-500">{stats.admins}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">Admins</p>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-5 h-5 absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input 
            placeholder="Buscar por nombre, correo o unidad..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-14 pl-14 bg-muted/30 border-none rounded-2xl font-medium text-lg"
          />
        </div>

        {/* Create User Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-lg rounded-3xl border-none shadow-2xl bg-card/95 backdrop-blur-xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black">Nuevo Residente</DialogTitle>
              <DialogDescription className="font-medium">
                Crea la cuenta y se generará un código QR de acceso automáticamente
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-5 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Nombre Completo *</Label>
                  <Input value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="Juan Pérez" className="h-12 bg-muted/30 border-none rounded-xl" required />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Correo Electrónico *</Label>
                  <Input value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} type="email" placeholder="residente@email.com" className="h-12 bg-muted/30 border-none rounded-xl" required />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Contraseña Temporal *</Label>
                  <Input value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} type="password" placeholder="Min. 6 caracteres" className="h-12 bg-muted/30 border-none rounded-xl" required />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Nº Apartamento</Label>
                  <Input value={newUserApartment} onChange={e => setNewUserApartment(e.target.value)} placeholder="101-A" className="h-12 bg-muted/30 border-none rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Teléfono</Label>
                  <Input value={newUserPhone} onChange={e => setNewUserPhone(e.target.value)} placeholder="+57 300..." className="h-12 bg-muted/30 border-none rounded-xl" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">ID Tarjeta NFC / Tag Proximidad</Label>
                  <Input value={newUserNfc} onChange={e => setNewUserNfc(e.target.value)} placeholder="Opcional — Serial de la tarjeta" className="h-12 bg-muted/30 border-none rounded-xl" />
                </div>
              </div>
              <div className="flex justify-end gap-4 pt-4">
                <Button type="button" variant="ghost" onClick={() => setShowCreateDialog(false)} className="rounded-xl h-12 font-bold">Cancelar</Button>
                <Button type="submit" disabled={isCreating} className="rounded-xl h-12 px-10 font-black shadow-lg shadow-primary/20 gap-2">
                  {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                  Crear Residente
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* QR Dialog */}
        <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
          <DialogContent className="sm:max-w-sm rounded-3xl border-none shadow-2xl bg-card/95 backdrop-blur-xl">
            <DialogHeader className="text-center">
              <DialogTitle className="text-2xl font-black">Código QR de Acceso</DialogTitle>
              <DialogDescription className="font-medium">
                {selectedUserQR?.full_name} — Apto {selectedUserQR?.apartment_number || 'N/A'}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center space-y-6 py-6">
              {selectedUserQR?.access_token ? (
                <>
                  <div className="bg-white p-6 rounded-3xl shadow-xl border-4 border-muted/50">
                    <QRCodeSVG 
                      value={JSON.stringify({
                        t: selectedUserQR.access_token,
                        u: selectedUserQR.id,
                        d: selectedUserQR.apartment_number
                      })} 
                      size={200} 
                      level="H"
                    />
                  </div>
                  <div className={`flex items-center gap-2 text-sm font-black uppercase tracking-widest px-6 py-3 rounded-full ${
                    selectedUserQR.status === 'active' 
                      ? 'bg-emerald-500/10 text-emerald-600' 
                      : 'bg-rose-500/10 text-rose-600'
                  }`}>
                    {selectedUserQR.status === 'active' ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                    {selectedUserQR.status === 'active' ? 'Acceso Activo' : 'Acceso Bloqueado'}
                  </div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    Token: {selectedUserQR.access_token}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground font-medium text-center py-8">Este usuario no tiene un código QR asignado.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* User Cards */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cargando residentes...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <Card className="card-elevated border-none shadow-2xl p-20 text-center bg-card/30 backdrop-blur-xl">
            <Users className="w-12 h-12 text-primary/30 mx-auto mb-4" />
            <h3 className="font-black text-2xl text-foreground">Sin resultados</h3>
            <p className="text-muted-foreground font-medium mt-2">No se encontraron usuarios con ese criterio.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredUsers.map((user, index) => (
              <motion.div key={user.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
                <Card className={`card-elevated border-none shadow-lg hover:shadow-2xl transition-all overflow-hidden bg-card/40 backdrop-blur-xl group ${user.status === 'blocked' ? 'ring-2 ring-rose-300' : ''}`}>
                  <div className={`h-1.5 ${user.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-inner ${
                        user.status === 'active' ? 'bg-primary/10' : 'bg-rose-500/10'
                      }`}>
                        <UserCircle className={`w-8 h-8 ${user.status === 'active' ? 'text-primary' : 'text-rose-500'}`} />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-black text-lg text-foreground truncate group-hover:text-primary transition-colors">
                            {user.full_name || 'Sin Nombre'}
                          </h4>
                          <div className="flex items-center gap-2">
                            {user.status === 'blocked' && (
                              <span className="text-[9px] font-black uppercase tracking-[0.15em] px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600">Moroso</span>
                            )}
                            {getRoleBadge(user.role)}
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground font-medium truncate">{user.email}</p>
                        <div className="flex items-center gap-4 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest flex-wrap">
                          {user.apartment_number && <span>Apto {user.apartment_number}</span>}
                          {user.nfc_card_id && <span>NFC: {user.nfc_card_id}</span>}
                          <span>{format(new Date(user.created_at), "d MMM, yyyy", { locale: es })}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-5 pt-4 border-t border-border/50 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {/* QR Button */}
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => showUserQR(user)} 
                          className="rounded-full font-bold gap-1.5 h-9 px-4 border-2"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          QR
                        </Button>

                        {/* Block/Unblock */}
                        {user.role !== 'super_admin' && user.id !== currentUser?.id && (
                          <Button 
                            variant={user.status === 'active' ? 'outline' : 'default'}
                            size="sm" 
                            onClick={() => toggleUserStatus(user.id, user.status)} 
                            disabled={updatingId === user.id}
                            className={`rounded-full font-bold gap-1.5 h-9 px-4 border-2 ${
                              user.status === 'active' 
                                ? 'border-rose-300 text-rose-600 hover:bg-rose-50' 
                                : 'bg-emerald-500 hover:bg-emerald-600 border-emerald-500 text-white'
                            }`}
                          >
                            {updatingId === user.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : user.status === 'active' ? (
                              <><ShieldAlert className="w-3.5 h-3.5" />Bloquear</>
                            ) : (
                              <><ShieldCheck className="w-3.5 h-3.5" />Activar</>
                            )}
                          </Button>
                        )}
                      </div>

                      {/* Role selector (super_admin only) */}
                      {isSuperAdmin && user.role !== 'super_admin' && user.id !== currentUser?.id && (
                        <Select
                          value={user.role}
                          onValueChange={(value) => handleRoleChange(user.id, value as 'admin' | 'resident')}
                          disabled={updatingId === user.id}
                        >
                          <SelectTrigger className="w-36 h-9 rounded-full border-none bg-muted/50 font-bold text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-none shadow-xl">
                            <SelectItem value="admin">Administrador</SelectItem>
                            <SelectItem value="resident">Residente</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ManageUsers;
