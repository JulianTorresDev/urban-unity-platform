import { useEffect, useState } from 'react';
import type { Tables } from '@/integrations/supabase/types';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { QrCode, Loader2, LogIn, LogOut, ShieldCheck, History, Copy, Check } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const MyAccess = () => {
  const { user } = useAuth();
  const [codes, setCodes] = useState<Tables<'access_codes'>[]>([]);
  const [logs, setLogs] = useState<Tables<'access_logs'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      try {
        const [codesRes, logsRes] = await Promise.all([
          supabase.from('access_codes').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
          supabase.from('access_logs').select('*, access_codes(*)').order('created_at', { ascending: false }).limit(50),
        ]);
        setCodes(codesRes.data || []);
        const userCodeIds = new Set((codesRes.data || []).map((c) => c.id));
        setLogs((logsRes.data || []).filter((l) => userCodeIds.has(l.access_code_id)));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [user]);

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    toast.success('Código copiado al portapapeles');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-6xl mx-auto">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[13px] font-medium text-primary">
              Mi hogar
            </span>
          </div>
          <h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold text-foreground tracking-tight">
            Mis accesos
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base font-medium">
            Tus códigos activos y el historial de ingresos por la garita.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-2xl bg-card shadow-hairline">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
            <p className="text-xs font-medium text-muted-foreground">Consultando registros...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Codes List */}
            <div className="space-y-4">
              <h2 className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <QrCode className="w-4 h-4 text-primary" />
                Mis credenciales activas
              </h2>

              {codes.length === 0 ? (
                <div className="border border-dashed border-border/80 rounded-2xl p-10 text-center bg-card">
                  <QrCode className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                  <h3 className="font-semibold text-base text-foreground">Sin credenciales asignadas</h3>
                  <p className="text-xs text-muted-foreground mt-1">Contacta a la administración para habilitar tu código QR de portería.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {codes.map(code => (
                    <div 
                      key={code.id}
                      className="p-6 rounded-2xl bg-card flex flex-col sm:flex-row items-center gap-6 shadow-hairline"
                    >
                      <div className="p-4 bg-white rounded-xl border border-border shadow-xs flex-shrink-0">
                        <QRCodeSVG value={code.code} size={130} />
                      </div>

                      <div className="space-y-3 flex-1 text-center sm:text-left">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Código de seguridad</p>
                          <p className="font-mono text-base font-semibold text-foreground tracking-wider mt-0.5">{code.code}</p>
                        </div>

                        <div className="flex items-center justify-center sm:justify-start gap-2">
                          <StatusBadge status={code.is_active ? 'success' : 'destructive'}>
                            {code.is_active ? 'Activo para ingreso' : 'Inactivo'}
                          </StatusBadge>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 px-3 rounded-lg border text-xs font-semibold gap-1.5"
                          onClick={() => copyCode(code.code, code.id)}
                        >
                          {copiedId === code.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedId === code.id ? 'Copiado' : 'Copiar texto'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Access Logs History */}
            <div className="space-y-4">
              <h2 className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <History className="w-4 h-4 text-primary" />
                Historial reciente de pasos
              </h2>

              <div className="rounded-2xl bg-card overflow-hidden shadow-hairline">
                {logs.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-xs font-medium">
                    No se registran pasos recientes asociados a tus credenciales.
                  </div>
                ) : (
                  <div className="divide-y-2 divide-border/60">
                    {logs.map((log) => (
                      <div key={log.id} className="p-4 sm:p-5 flex items-center justify-between gap-4 hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                            log.direction === 'entry' 
                              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' 
                              : 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                          }`}>
                            {log.direction === 'entry' ? <LogIn className="w-5 h-5" /> : <LogOut className="w-5 h-5" />}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-foreground">
                              {log.direction === 'entry' ? 'Ingreso registrado' : 'Salida registrada'}
                            </p>
                            <p className="text-xs font-medium text-muted-foreground">Garita principal</p>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-xs font-semibold text-foreground">
                            {format(new Date(log.created_at), "d 'de' MMMM, yyyy", { locale: es })}
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
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default MyAccess;
