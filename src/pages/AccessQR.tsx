import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/integrations/supabase/client';
import { QrCode, ShieldCheck, ShieldAlert, Loader2, Info, Lock } from 'lucide-react';
import { motion } from 'framer-motion';

const AccessQR = () => {
  const { user } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);

  const fetchToken = async () => {
    if (!user) return;
    setLoading(true);
    
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
    setLoading(false);
  };

  useEffect(() => {
    fetchToken();
  }, [user]);

  const isBlocked = profile?.status === 'blocked';

  return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center space-y-10 max-w-lg mx-auto py-8">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h1 className="font-display text-4xl font-black flex items-center justify-center gap-4 text-foreground tracking-tight">
            <div className="p-2 bg-primary/10 rounded-xl">
              <QrCode className="w-8 h-8 text-primary" />
            </div>
            Llave Digital
          </h1>
          <p className="text-muted-foreground mt-3 text-lg font-medium">
            Presenta este código en portería para validar tu acceso
          </p>
        </motion.div>

        {/* Blocked Banner */}
        {isBlocked && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full"
          >
            <Card className="border-none shadow-2xl bg-rose-50 overflow-hidden">
              <div className="h-2 bg-rose-500" />
              <CardContent className="p-6 text-center space-y-3">
                <div className="w-16 h-16 bg-rose-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-rose-200">
                  <ShieldAlert className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-black text-rose-900">Acceso Suspendido</h3>
                <p className="text-rose-700/80 font-medium text-sm leading-relaxed">
                  Tu acceso ha sido suspendido por morosidad. Contacta a administración para regularizar tu situación.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="w-full"
        >
          <Card className={`w-full card-elevated border-none shadow-2xl overflow-hidden bg-card/40 backdrop-blur-xl relative ${isBlocked ? 'opacity-60 grayscale' : ''}`}>
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
            
            <CardHeader className="text-center pb-6 relative z-10 border-b border-border/50">
              <div className={`mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg ${isBlocked ? 'bg-rose-500 shadow-rose-200' : 'bg-primary shadow-primary/20'}`}>
                <Lock className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-3xl font-black text-foreground">{profile?.full_name || 'Residente'}</CardTitle>
              <CardDescription className="font-black text-primary uppercase tracking-[0.2em] mt-1">
                Apto {profile?.apartment_number || 'N/A'}
              </CardDescription>
            </CardHeader>
            
            <CardContent className="flex flex-col items-center space-y-8 pt-8 relative z-10">
              <div className="relative">
                <div className={`absolute -inset-4 rounded-[3rem] blur-2xl animate-pulse ${isBlocked ? 'bg-rose-500/10' : 'bg-primary/10'}`} />
                <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl relative z-20 border-8 border-muted/50">
                  {loading ? (
                    <div className="w-48 h-48 flex items-center justify-center">
                      <Loader2 className="w-12 h-12 animate-spin text-primary" />
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
                    <div className="w-48 h-48 flex items-center justify-center text-muted-foreground font-black text-center text-xs uppercase">
                      <div className="space-y-3">
                        <QrCode className="w-12 h-12 mx-auto opacity-30" />
                        <p>No tienes un código QR asignado.<br/>Solicítalo a administración.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className={`flex items-center gap-3 text-sm font-black px-8 py-4 rounded-2xl border shadow-sm uppercase tracking-widest ${
                isBlocked 
                  ? 'text-rose-600 bg-rose-500/10 border-rose-500/20' 
                  : 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20'
              }`}>
                {isBlocked ? (
                  <><ShieldAlert className="w-5 h-5" />Acceso Bloqueado</>
                ) : (
                  <><ShieldCheck className="w-5 h-5 animate-bounce" />Acceso Autorizado</>
                )}
              </div>

              <div className="w-full px-4">
                <div className="flex items-start gap-3 p-4 bg-muted/40 rounded-2xl border border-border/50">
                  <Info className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] font-bold text-muted-foreground leading-relaxed uppercase tracking-wider">
                    Tu código QR es fijo y personal. Muéstralo en portería para validar tu ingreso al conjunto.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default AccessQR;
