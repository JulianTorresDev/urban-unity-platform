import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { createResident, setUserRole } from '@/lib/adminUsers';
import { rolesByUser } from '@/lib/roles';
import { 
  Users, 
  Loader2, 
  Shield, 
  UserCircle, 
  Plus, 
  ShieldCheck, 
  ShieldAlert, 
  QrCode, 
  Search, 
  Building, 
  Phone, 
  Mail, 
  CreditCard,
  Building2,
  Lock
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';

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
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Create user modal
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserApartment, setNewUserApartment] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserNfc, setNewUserNfc] = useState('');

  // QR Modal
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [selectedUserQR, setSelectedUserQR] = useState<UserWithRole | null>(null);

  const fetchUsers = async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name, apartment_number, phone, nfc_card_id, status, created_at');

      if (profilesError) {
        toast.error('Error al cargar perfiles de usuarios');
        return;
      }

      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role');

      const { data: tokens } = await supabase
        .from('access_tokens')
        .select('user_id, token')
        .eq('type', 'permanent');

      const rolesMap = rolesByUser(roles ?? []);
      const tokensMap = new Map(tokens?.map((t) => [t.user_id, t.token]));

      const usersWithRoles: UserWithRole[] = (profiles || []).map((p) => ({
        ...p,
        role: rolesMap.get(p.id) || 'resident',
        access_token: tokensMap.get(p.id) || null,
      }));

      setUsers(usersWithRoles);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      toast.error('Nombre, correo y contraseña son obligatorios');
      return;
    }

    setIsCreating(true);
    try {
      const { id, error } = await createResident({
        fullName: newUserName,
        email: newUserEmail,
        password: newUserPassword,
        apartment: newUserApartment,
        phone: newUserPhone,
        nfc: newUserNfc,
      });

      if (error && !id) {
        toast.error('Error al crear usuario: ' + error);
      } else {
        if (error) toast.warning(error);
        else toast.success('Residente creado. Su código QR permanente ya está disponible.');
        setShowCreateDialog(false);
        resetCreateForm();
        fetchUsers();
      }
    } catch (err) {
      toast.error('Error al procesar el registro');
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
    const nextStatus = currentStatus === 'active' ? 'blocked' : 'active';
    setUpdatingId(userId);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: nextStatus })
        .eq('id', userId);

      if (error) {
        toast.error('Error al actualizar estado del residente');
      } else {
        toast.success(`Acceso de residente ${nextStatus === 'active' ? 'reactivado' : 'suspendido'}`);
        fetchUsers();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'resident') => {
    setUpdatingId(userId);
    try {
      // upsert agregaba una segunda fila de rol en vez de reemplazar la anterior
      const error = await setUserRole(userId, newRole);

      if (error) {
        toast.error('Error al modificar rol: ' + error);
      } else {
        toast.success('Rol actualizado con éxito');
        fetchUsers();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  };

  const showUserQR = (user: UserWithRole) => {
    setSelectedUserQR(user);
    setShowQRDialog(true);
  };

  const filteredUsers = users.filter((u) => {
    const term = searchTerm.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      u.apartment_number?.toLowerCase().includes(term) ||
      u.phone?.toLowerCase().includes(term)
    );
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'super_admin':
        return <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-action/10 text-foreground border border-action/25">Superadministrador</span>;
      case 'admin':
        return <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/25">Administrador</span>;
      default:
        return <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-muted text-foreground border border-border">Residente</span>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[13px] font-medium text-primary">
                Comunidad
              </span>
            </div>
            <h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold text-foreground tracking-tight">
              Residentes
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base font-medium">
              Registra residentes y administra sus roles, códigos QR y estado de acceso.
            </p>
          </div>

          <Button 
            onClick={() => setShowCreateDialog(true)}
            size="lg" 
            className="h-12 px-6 text-[15px] flex-shrink-0"
          >
            <Plus className="w-5 h-5" />
            Registrar residente
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre, correo, apartamento o teléfono..."
            className="h-12 pl-12"
          />
        </div>

        {/* Users Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-2xl bg-card shadow-hairline">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
            <p className="text-xs font-medium text-muted-foreground">Cargando residentes…</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="border border-dashed border-border/80 rounded-2xl p-12 text-center bg-card">
            <Users className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <h3 className="font-semibold text-base text-foreground">No se encontraron residentes</h3>
            <p className="text-xs text-muted-foreground mt-1">Prueba con otro término de búsqueda o registra un nuevo residente.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredUsers.map((user) => (
              <div 
                key={user.id}
                className={`p-6 rounded-2xl border bg-card transition-[color,background-color,border-color,box-shadow,opacity,transform] shadow-xs space-y-5 ${
                  user.status === 'blocked' ? 'border-destructive/40 bg-destructive/[0.02]' : 'border-border/80 hover:border-primary/40'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-semibold ${
                      user.status === 'active' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-destructive/10 text-destructive border border-destructive/30'
                    }`}>
                      <UserCircle className="w-7 h-7" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-foreground leading-snug">{user.full_name || 'Sin nombre'}</h3>
                      <p className="text-xs text-muted-foreground font-medium truncate max-w-[200px] sm:max-w-xs">{user.email}</p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-background border border-border text-foreground">
                      Apto {user.apartment_number || 'S/N'}
                    </span>
                    {getRoleBadge(user.role)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-medium text-muted-foreground bg-muted/20 p-3 rounded-xl border border-border/60">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-primary" />
                    <span>{user.phone || 'Sin teléfono'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-3.5 h-3.5 text-primary" />
                    <span className="truncate">NFC: {user.nfc_card_id || 'No asignada'}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/70 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => showUserQR(user)}
                      className="h-10 px-4 rounded-xl border font-semibold text-xs gap-1.5"
                    >
                      <QrCode className="w-4 h-4 text-primary" />
                      Ver llave QR
                    </Button>

                    {user.role !== 'super_admin' && user.id !== currentUser?.id && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleUserStatus(user.id, user.status)}
                        disabled={updatingId === user.id}
                        className={`h-10 px-4 rounded-xl border font-semibold text-xs gap-1.5 ${
                          user.status === 'active'
                            ? 'border-destructive/40 text-destructive hover:bg-destructive/10'
                            : 'border-success/40 bg-success/10 text-success hover:bg-success/20'
                        }`}
                      >
                        {updatingId === user.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : user.status === 'active' ? (
                          <>
                            <ShieldAlert className="w-3.5 h-3.5" />
                            Suspender
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Reactivar
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  {isSuperAdmin && user.role !== 'super_admin' && user.id !== currentUser?.id && (
                    <Select
                      value={user.role}
                      onValueChange={(val) => handleRoleChange(user.id, val as 'admin' | 'resident')}
                      disabled={updatingId === user.id}
                    >
                      <SelectTrigger className="w-36 h-10 rounded-xl border border-border/80 bg-background font-semibold text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border border-border bg-card">
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="resident">Residente</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create User Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-lg rounded-2xl bg-card p-6 sm:p-8">
            <DialogHeader className="border-b border-border/70 pb-4">
              <DialogTitle className="text-2xl font-semibold text-foreground">
                Registrar nuevo residente
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm font-medium">
                Crea la cuenta del residente. Su código QR permanente se genera automáticamente.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateUser} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="manage-users-nombre-completo" className="text-xs font-semibold text-foreground">Nombre completo *</Label>
                <Input id="manage-users-nombre-completo"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Ej: Laura Mercedes Gómez"
                  required
                  className="h-12 border border-border/80 rounded-xl bg-background font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="manage-users-correo-electronico" className="text-xs font-semibold text-foreground">Correo electrónico *</Label>
                  <Input id="manage-users-correo-electronico"
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    placeholder="residente@email.com"
                    required
                    className="h-12 border border-border/80 rounded-xl bg-background font-semibold"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manage-users-contrasena-inicial" className="text-xs font-semibold text-foreground">Contraseña inicial *</Label>
                  <Input id="manage-users-contrasena-inicial"
                    type="password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                    className="h-12 border border-border/80 rounded-xl bg-background font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="manage-users-numero-de-departamento" className="text-xs font-semibold text-foreground">Número de departamento</Label>
                  <Input id="manage-users-numero-de-departamento"
                    value={newUserApartment}
                    onChange={(e) => setNewUserApartment(e.target.value)}
                    placeholder="Ej: Torre 2 - 301"
                    className="h-12 border border-border/80 rounded-xl bg-background font-semibold"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manage-users-telefono-movil" className="text-xs font-semibold text-foreground">Teléfono móvil</Label>
                  <Input id="manage-users-telefono-movil"
                    value={newUserPhone}
                    onChange={(e) => setNewUserPhone(e.target.value)}
                    placeholder="+593 99 000 0000"
                    className="h-12 border border-border/80 rounded-xl bg-background font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="manage-users-tarjeta-nfc-opcional" className="text-xs font-semibold text-foreground">Tarjeta NFC (opcional)</Label>
                <Input id="manage-users-tarjeta-nfc-opcional"
                  value={newUserNfc}
                  onChange={(e) => setNewUserNfc(e.target.value)}
                  placeholder="Ej: E2801170..."
                  className="h-12 border border-border/80 rounded-xl bg-background font-semibold"
                />
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-border/70">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowCreateDialog(false)} 
                  className="w-full sm:w-auto h-12 rounded-xl font-semibold border"
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={isCreating} 
                  className="w-full sm:w-auto h-12 px-8 rounded-xl font-semibold shadow-sm gap-2"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Registrando...
                    </>
                  ) : (
                    'Crear residente'
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* QR Dialog */}
        <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
          <DialogContent className="sm:max-w-sm rounded-2xl bg-card p-6 text-center">
            <DialogHeader className="text-center">
              <DialogTitle className="text-xl font-semibold text-foreground">Credencial de acceso</DialogTitle>
              <DialogDescription className="text-xs font-medium text-muted-foreground">
                {selectedUserQR?.full_name} • Apto {selectedUserQR?.apartment_number || 'S/N'}
              </DialogDescription>
            </DialogHeader>

            <div className="py-6 flex flex-col items-center space-y-5">
              {selectedUserQR?.access_token ? (
                <>
                  <div className="p-4 bg-white rounded-2xl border border-border shadow-md">
                    <QRCodeSVG 
                      value={JSON.stringify({
                        t: selectedUserQR.access_token,
                        u: selectedUserQR.id,
                        d: selectedUserQR.apartment_number
                      })} 
                      size={180} 
                      level="H"
                    />
                  </div>
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-semibold ${
                    selectedUserQR.status === 'active' 
                      ? 'border-success/30 bg-success/10 text-success' 
                      : 'border-destructive/30 bg-destructive/10 text-destructive'
                  }`}>
                    {selectedUserQR.status === 'active' ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                    <span>{selectedUserQR.status === 'active' ? 'Acceso autorizado' : 'Acceso suspendido'}</span>
                  </div>
                </>
              ) : (
                <p className="text-xs font-medium text-muted-foreground py-6">
                  No se ha generado token de acceso para este usuario.
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default ManageUsers;
