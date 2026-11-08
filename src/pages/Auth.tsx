import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Loader2, AlertCircle, ShieldAlert, Receipt, CalendarDays, QrCode } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, SplitText);

const emailSchema = z.string().email('Ingresa un correo electrónico válido.');
const passwordSchema = z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.');

const highlights = [
  { icon: Receipt, title: 'Alícuotas al día', text: 'Consulta tu estado de cuenta y sube tu comprobante en segundos.' },
  { icon: CalendarDays, title: 'Áreas comunes', text: 'Reserva el salón o la zona BBQ sin cruces de horario.' },
  { icon: QrCode, title: 'Acceso con QR', text: 'Tu llave digital para la garita, siempre en tu teléfono.' },
];

const Auth = () => {
  const navigate = useNavigate();
  const { user, signIn, signOut, loading } = useAuth();
  const { settings } = useTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Entrada única de la pantalla de acceso: bloques escalonados cada 100 ms y titular revelado por líneas.
  // Se omite por completo con "reducir movimiento".
  useGSAP(
    () => {
      if (!rootRef.current) return;
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('[data-enter]', {
          opacity: 0,
          y: 12,
          filter: 'blur(4px)',
          duration: 0.6,
          ease: 'power3.out',
          stagger: 0.1,
          clearProps: 'opacity,transform,filter',
        });
      });

      mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
        if (headingRef.current) {
          SplitText.create(headingRef.current, {
            type: 'lines',
            mask: 'lines',
            autoSplit: true,
            onSplit: (self) =>
              gsap.from(self.lines, { yPercent: 100, duration: 1, ease: 'expo.out', stagger: 0.12, delay: 0.15 }),
          });
        }
        gsap.from('[data-reveal]', {
          opacity: 0,
          y: 12,
          filter: 'blur(4px)',
          duration: 0.6,
          ease: 'power3.out',
          stagger: 0.1,
          delay: 0.5,
          clearProps: 'opacity,transform,filter',
        });
      });
    },
    { scope: rootRef, dependencies: [loading] }
  );

  useEffect(() => {
    if (user && !loading && !isBlocked) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate, isBlocked]);

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
        setError('El correo o la contraseña no son correctos.');
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
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div ref={rootRef} className="min-h-[100dvh] grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] bg-card">
      {/* Columna del formulario */}
      <div className="flex flex-col px-6 sm:px-10 py-8">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: settings.logo_url ? 'transparent' : settings.primary_color || '#0071e3' }}
          >
            {settings.logo_url ? (
              <img src={settings.logo_url} alt="" className="w-full h-full object-contain" />
            ) : (
              <Building2 className="w-[18px] h-[18px] text-white" strokeWidth={1.75} />
            )}
          </div>
          <span className="text-[15px] font-semibold tracking-tight">{settings.company_name}</span>
        </div>

        <div className="flex-1 flex items-center justify-center py-12">
          <div className="w-full max-w-[380px]">
            <h1 data-enter className="text-[32px] leading-tight font-semibold tracking-tight">Inicia sesión</h1>
            <p data-enter className="mt-2 text-[15px] text-muted-foreground">
              Usa el correo que registraste en la administración del conjunto.
            </p>

            {isBlocked && (
              <div role="alert" className="mt-8 rounded-xl bg-destructive/[0.06] border border-destructive/20 p-4 flex gap-3">
                <ShieldAlert className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" strokeWidth={1.75} />
                <div>
                  <p className="text-sm font-semibold text-foreground">Tu acceso está suspendido</p>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                    La cuenta se suspendió por alícuotas pendientes. Comunícate con la administración para reactivarla.
                  </p>
                </div>
              </div>
            )}

            <form data-enter onSubmit={handleLogin} className="mt-8 space-y-5" noValidate>
              <div className="space-y-2">
                <Label htmlFor="login-email" className="text-sm font-medium">
                  Correo electrónico
                </Label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="nombre@correo.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  aria-invalid={Boolean(error)}
                  required
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password" className="text-sm font-medium">
                  Contraseña
                </Label>
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  aria-invalid={Boolean(error)}
                  required
                  className="h-12"
                />
              </div>

              {error && (
                <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" strokeWidth={2} />
                  <span>{error}</span>
                </p>
              )}

              <Button type="submit" size="lg" className="w-full h-12" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verificando…
                  </>
                ) : (
                  'Continuar'
                )}
              </Button>
            </form>

            <p data-enter className="mt-8 text-sm text-muted-foreground leading-relaxed">
              ¿No puedes ingresar? Acércate a la garita o escribe a la administración para recuperar tu acceso.
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">Conjunto Habitacional Gissel's 2 · Llano Grande, Quito</p>
      </div>

      {/* Panel editorial (solo escritorio) */}
      <aside className="hidden lg:flex relative flex-col justify-between bg-[#0b0b0c] text-white p-14 xl:p-16">

        <p className="text-sm text-white/60">90 viviendas · Una sola plataforma</p>

        <div className="max-w-md">
          <h2 ref={headingRef} className="text-[44px] xl:text-[52px] leading-[1.05] font-semibold tracking-[-0.03em] text-white">
            Tu conjunto,
            <br />
            <span className="text-white/50">en orden.</span>
          </h2>

          <ul className="mt-12 divide-y divide-white/10 border-y border-white/10">
            {highlights.map(({ icon: Icon, title, text }) => (
              <li key={title} data-reveal className="flex gap-4 py-5">
                <Icon className="w-5 h-5 text-white/70 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                <div>
                  <p className="text-[15px] font-medium text-white">{title}</p>
                  <p className="mt-1 text-sm text-white/55 leading-relaxed">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/55">Pagos por transferencia validados por la administración.</p>
      </aside>
    </div>
  );
};

export default Auth;
