import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from './demoSeed';
import { resetDemoData, signInAsDemo } from './demoClient';

/** Barra flotante de la demo: cambia de cuenta de ejemplo o restablece los datos. */
export default function DemoBar() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);

  const enter = async (email: string, role: string) => {
    setBusy(email);
    if (user) await signOut();
    const { error } = await signInAsDemo(email);
    setBusy(null);
    if (error) {
      toast.error('No se pudo entrar con la cuenta de ejemplo');
      return;
    }
    navigate(role === 'resident' ? '/dashboard' : '/admin');
  };

  const reset = async () => {
    resetDemoData();
    if (user) await signOut();
    toast.success('Datos de ejemplo restablecidos');
    navigate('/auth');
  };

  return (
    <div
      role="region"
      aria-label="Controles de la demo"
      className="fixed bottom-3 left-1/2 z-[60] flex max-w-[calc(100vw-24px)] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-2xl bg-foreground/95 p-1.5 text-background shadow-lg backdrop-blur"
      style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <span className="px-2 text-[11px] font-semibold uppercase tracking-wider opacity-70" title={`Contraseña de todas las cuentas: ${DEMO_PASSWORD}`}>
        Demo
      </span>
      {DEMO_ACCOUNTS.map((a) => {
        const active = user?.email === a.email;
        return (
          <button
            key={a.email}
            type="button"
            onClick={() => enter(a.email, a.role)}
            disabled={busy !== null}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 ${active ? 'bg-background text-foreground' : 'hover:bg-background/15'}`}
          >
            <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
            {busy === a.email ? 'Entrando…' : a.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium opacity-80 transition-colors hover:bg-background/15 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        Restablecer
      </button>
    </div>
  );
}
