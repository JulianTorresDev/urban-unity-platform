import { useEffect, useState } from 'react';
import type { Tables } from '@/integrations/supabase/types';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/integrations/supabase/client';
import { QrCode, ShieldCheck, ShieldAlert, Loader2, Info, Lock, KeyRound, Building2 } from 'lucide-react';
import { motion } from 'framer-motion';

const AccessQR = () => {
  const { user } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Tables<'profiles'> | null>(null);

  const fetchToken = async () => {
    if (!user) return;
    setLoading(true);
    
    try {
      const { data } = await supabase
        .from('access_tokens')
        .select('token')
        .eq('user_id', user.id)
        .eq('type', 'permanent')
        .maybeSingle();

      if (data) {
        setToken(data.token);
      }
      
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(prof);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchToken();
  }, [user]);

  const isBlocked = profile?.status === 'blocked';

  return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center space-y-8 max-w-lg mx-auto py-4">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
            <KeyRound className="w-3.5 h-3.5" />
            <span>Mi hogar</span>
          </div>
          <h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold text-foreground tracking-tight">
            Acceso QR
          </h1>
          <p className="text-muted-foreground text-sm font-medium">
            Muestra este código en la garita para ingresar.
          </p>
        </div>

        {/* Blocked Alert Banner if applicable */}
        {isBlocked && (
          <div className="w-full rounded-2xl border border-rose-500 bg-rose-500/10 p-5 space-y-2 text-center">
            <div className="w-12 h-12 rounded-xl bg-rose-500 text-white flex items-center justify-center mx-auto shadow-md">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-rose-700 dark:text-rose-400">Acceso suspendido</h3>
            <p className="text-xs text-rose-700 dark:text-rose-300 font-medium leading-relaxed">
              Tu código está inactivo por pagos pendientes o por decisión de la administración. Sube tu comprobante o acércate a la oficina.
            </p>
          </div>
        )}

        {/* High-End Architectural Digital Credential Card */}
        <div className={`w-full rounded-2xl bg-card overflow-hidden shadow-hairline ${isBlocked ? 'opacity-70 grayscale' : ''}`}>
          {/* Card Head */}
          <div className="p-6 bg-muted/40 border-b border-border/70 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-semibold shadow-sm">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-primary">Residente titular</p>
                <h2 className="text-xl font-semibold text-foreground">{profile?.full_name || 'Residente'}</h2>
              </div>
            </div>

            <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-background border border-border/80 text-foreground">
              Apto {profile?.apartment_number || 'S/N'}
            </span>
          </div>

          {/* QR Code Container */}
          <div className="p-8 flex flex-col items-center justify-center space-y-6">
            <div className="p-5 rounded-2xl bg-white border border-border/80 shadow-md flex items-center justify-center">
              {loading ? (
                <div className="w-48 h-48 flex items-center justify-center">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                </div>
              ) : token ? (
                <QRCodeSVG 
                  value={JSON.stringify({
                    t: token,
                    u: user?.id,
                    d: profile?.apartment_number
                  })} 
                  size={200}
                  level="H"
                  includeMargin={false}
                />
              ) : (
                <div className="w-48 h-48 flex flex-col items-center justify-center text-center p-4 text-muted-foreground">
                  <QrCode className="w-12 h-12 mb-2 opacity-40" />
                  <p className="text-xs font-semibold text-foreground">Sin código asignado</p>
                  <p className="text-xs mt-1">Solicita tu activación en la administración.</p>
                </div>
              )}
            </div>

            {/* Verification Status Pill */}
            <div className={`flex items-center gap-2 px-6 py-3 rounded-xl border font-semibold text-xs ${
              isBlocked
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-600'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
            }`}>
              {isBlocked ? (
                <>
                  <ShieldAlert className="w-4 h-4" />
                  <span>Acceso no autorizado</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Código activo</span>
                </>
              )}
            </div>

            <div className="w-full p-4 rounded-xl border border-border/80 bg-muted/20 flex items-start gap-3 text-left">
              <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                Este código QR es único, personal e intransferible. El sistema registra hora y sentido de paso al ser escaneado en los accesos peatonales y vehiculares.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AccessQR;
