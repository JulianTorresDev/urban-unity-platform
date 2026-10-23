import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Building2, Loader2, AlertCircle, ShieldAlert, Lock } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';
import { toast } from 'sonner';

const emailSchema = z.string().email('Por favor ingresa un correo válido');
const passwordSchema = z.string().min(6, 'La contraseña debe tener al menos 6 caracteres');

const Auth = () => {
  const navigate = useNavigate();
  const { user, signIn, signOut, loading } = useAuth();
  const { settings } = useTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Vistas: login | forgot (pedir correo) | recovery (definir nueva contraseña)
  const [view, setView] = useState<'login' | 'forgot' | 'recovery'>('login');
  const [forgotEmail, setForgotEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    // Al llegar desde el enlace de recuperación del correo, Supabase emite este evento
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setView('recovery');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user && !loading && !isBlocked && view === 'login') {
      navigate('/dashboard');
    }
  }, [user, loading, navigate, isBlocked, view]);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      emailSchema.parse(forgotEmail);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
        return;
      }
    }
    setIsSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/auth`,
    });
    setIsSubmitting(false);
    if (resetError) {
      setError(resetError.message);
    } else {
      toast.success('Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.');
      setView('login');
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      passwordSchema.parse(newPassword);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
        return;
      }
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setIsSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setIsSubmitting(false);
    if (updateError) {
      setError(updateError.message);
    } else {
      toast.success('Contraseña actualizada correctamente');
      setView('login');
      navigate('/dashboard');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsBlocked(false);
    
    try {
      emailSchema.parse(loginEmail);
      passwordSchema.parse(loginPassword);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
        return;
      }
    }
    
    setIsSubmitting(true);
    const { error: signInError } = await signIn(loginEmail, loginPassword);
    
    if (signInError) {
      setIsSubmitting(false);
      if (signInError.message.includes('Invalid login credentials')) {
        setError('Correo o contraseña incorrectos. Por favor intenta de nuevo.');
      } else {
        setError(signInError.message);
      }
      return;
    }

    // Check if user is blocked
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', authUser.id)
        .single();

      if (profile?.status === 'blocked') {
        setIsBlocked(true);
        setError(null);
        await signOut();
        setIsSubmitting(false);
        return;
      }
    }

    setIsSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-2xl border-4 border-white overflow-hidden">
            {settings.logo_url ? (
              <img src={settings.logo_url} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <Building2 className="w-10 h-10 text-white" />
            )}
          </div>
          <h1 className="font-display text-4xl font-black text-foreground tracking-tight">{settings.company_name}</h1>
          <p className="text-muted-foreground mt-2 font-medium">Gestión Residencial Inteligente</p>
        </div>

        {/* Blocked User Banner */}
        {isBlocked && (
          <Card className="border-none shadow-2xl bg-rose-50 mb-6 overflow-hidden">
            <div className="h-2 bg-rose-500" />
            <CardContent className="p-8 text-center space-y-4">
              <div className="w-20 h-20 bg-rose-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-rose-200">
                <ShieldAlert className="w-10 h-10 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-rose-900">Acceso Suspendido</h3>
                <p className="text-rose-700/80 font-medium mt-2 leading-relaxed">
                  Tu cuenta ha sido suspendida por morosidad en el pago de alícuotas. 
                  Por favor contacta a la administración del conjunto para regularizar tu situación.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 text-[10px] font-black text-rose-500 uppercase tracking-widest">
                <Lock className="w-3.5 h-3.5" />
                Código de acceso QR deshabilitado
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-none shadow-2xl bg-card/80 backdrop-blur-md">
          <CardContent className="p-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-black text-foreground">
                {view === 'login' && 'Iniciar Sesión'}
                {view === 'forgot' && 'Recuperar Contraseña'}
                {view === 'recovery' && 'Nueva Contraseña'}
              </h2>
              <p className="text-muted-foreground text-sm font-medium mt-1">
                {view === 'login' && 'Ingresa con las credenciales proporcionadas por tu administración'}
                {view === 'forgot' && 'Te enviaremos un enlace de restablecimiento a tu correo'}
                {view === 'recovery' && 'Define tu nueva contraseña para continuar'}
              </p>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-3 text-sm text-destructive font-medium">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {view === 'login' && (
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Correo Electrónico</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="tu@correo.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    className="h-14 bg-muted/30 border-none rounded-2xl px-5 font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Contraseña</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    className="h-14 bg-muted/30 border-none rounded-2xl px-5 font-medium"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-14 rounded-2xl shadow-xl shadow-primary/20 hover:shadow-primary/30 transition-all font-black text-lg active:scale-95"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    'Ingresar'
                  )}
                </Button>
                <button
                  type="button"
                  onClick={() => { setError(null); setView('forgot'); }}
                  className="w-full text-center text-sm font-bold text-primary hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </form>
            )}

            {view === 'forgot' && (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email" className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Correo Electrónico</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="tu@correo.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    className="h-14 bg-muted/30 border-none rounded-2xl px-5 font-medium"
                  />
                </div>
                <Button type="submit" className="w-full h-14 rounded-2xl font-black text-lg" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    'Enviar Enlace de Recuperación'
                  )}
                </Button>
                <button
                  type="button"
                  onClick={() => { setError(null); setView('login'); }}
                  className="w-full text-center text-sm font-bold text-muted-foreground hover:text-primary hover:underline"
                >
                  Volver a iniciar sesión
                </button>
              </form>
            )}

            {view === 'recovery' && (
              <form onSubmit={handleRecovery} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="new-password" className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Nueva Contraseña</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className="h-14 bg-muted/30 border-none rounded-2xl px-5 font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Confirmar Contraseña</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="h-14 bg-muted/30 border-none rounded-2xl px-5 font-medium"
                  />
                </div>
                <Button type="submit" className="w-full h-14 rounded-2xl font-black text-lg" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    'Guardar Nueva Contraseña'
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-8 font-medium">
          ¿No tienes cuenta? Solicita acceso a la administración de tu conjunto residencial.
        </p>
      </div>
    </div>
  );
};

export default Auth;
