import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QrCode, Loader2, LogIn, LogOut } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { QRCodeSVG } from 'qrcode.react';

const MyAccess = () => {
  const { user } = useAuth();
  const [codes, setCodes] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const [codesRes, logsRes] = await Promise.all([
        supabase.from('access_codes').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('access_logs').select('*, access_codes(*)').order('created_at', { ascending: false }).limit(50),
      ]);
      setCodes(codesRes.data || []);
      // Filter logs for user's codes
      const userCodeIds = new Set((codesRes.data || []).map((c: any) => c.id));
      setLogs((logsRes.data || []).filter((l: any) => userCodeIds.has(l.access_code_id)));
      setLoading(false);
    };
    fetch();
  }, [user]);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-3">
            <QrCode className="w-8 h-8 text-primary" />
            Mi Acceso QR
          </h1>
          <p className="text-muted-foreground mt-1">Tu código QR personal y registro de accesos</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <>
            {codes.length === 0 ? (
              <Card className="card-elevated">
                <CardContent className="py-12 text-center">
                  <QrCode className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-semibold text-lg">Sin código QR asignado</h3>
                  <p className="text-muted-foreground">Contacta a la administración para solicitar tu código de acceso.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {codes.map(code => (
                  <Card key={code.id} className="card-elevated">
                    <CardHeader>
                      <CardTitle className="text-lg">Mi Código QR</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center gap-4">
                      <QRCodeSVG value={code.code} size={200} />
                      <p className="font-mono text-sm text-muted-foreground">{code.code}</p>
                      <StatusBadge status={code.is_active ? 'success' : 'destructive'}>
                        {code.is_active ? 'Activo' : 'Inactivo'}
                      </StatusBadge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>Mis Registros de Acceso</CardTitle>
              </CardHeader>
              <CardContent>
                {logs.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Sin registros de acceso</p>
                ) : (
                  <div className="space-y-2">
                    {logs.map((log: any) => (
                      <div key={log.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                        <div className="flex items-center gap-3">
                          {log.direction === 'entry' ? (
                            <LogIn className="w-5 h-5 text-green-500" />
                          ) : (
                            <LogOut className="w-5 h-5 text-orange-500" />
                          )}
                          <StatusBadge status={log.direction === 'entry' ? 'success' : 'warning'}>
                            {log.direction === 'entry' ? 'Entrada' : 'Salida'}
                          </StatusBadge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(log.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default MyAccess;
