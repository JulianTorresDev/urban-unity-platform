import { useEffect, useState, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '@/integrations/supabase/client';
import { 
  ShieldCheck, 
  ShieldAlert, 
  User, 
  Home, 
  Clock, 
  QrCode, 
  Loader2, 
  Camera, 
  History, 
  RefreshCcw, 
  AlertTriangle,
  Building2,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { evaluateAccessToken, parseQrPayload } from '@/lib/accessControl';

interface ScanResult {
  valid: boolean;
  blocked?: boolean;
  user?: string | null;
  domicile?: string | null;
  message?: string;
  timestamp?: string;
}

interface ScanHistoryItem {
  id: string;
  user: string;
  domicile: string;
  valid: boolean;
  timestamp: string;
}

const VerifyQR = () => {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    Html5Qrcode.getCameras().then(cameras => {
      setHasCamera(cameras && cameras.length > 0);
    }).catch(() => {
      setHasCamera(false);
    });

    return () => {
      stopScanner();
    };
  }, []);

  const startScanner = async () => {
    setScanResult(null);
    setScannerActive(true);
    
    setTimeout(async () => {
      try {
        const html5QrCode = new Html5Qrcode("reader");
        scannerRef.current = html5QrCode;
        
        const config = { 
          fps: 15, 
          qrbox: (viewWidth: number, viewHeight: number) => {
            const minDim = Math.min(viewWidth, viewHeight);
            const size = Math.floor(minDim * 0.7);
            return { width: size, height: size };
          }
        };

        await html5QrCode.start(
          { facingMode: "environment" }, 
          config,
          onScanSuccess,
          () => {} // los fotogramas sin código no son errores
        );
      } catch (err) {
        console.error("Error starting scanner:", err);
        toast.error("No se pudo acceder a la cámara. Verifica los permisos e HTTPS.");
        setScannerActive(false);
      }
    }, 100);
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
    }
    setScannerActive(false);
  };

  const onScanSuccess = async (decodedText: string) => {
    await stopScanner();
    verifyToken(parseQrPayload(decodedText));
  };

  const verifyToken = async (token: string) => {
    setIsVerifying(true);
    
    try {
      const { data, error } = await supabase
        .from('access_tokens')
        .select('*, profiles(full_name, apartment_number, status)')
        .eq('token', token)
        .single();

      const decision = evaluateAccessToken(error ? null : data);

      if (decision.reason === 'expired') {
        // Un pase temporal vencido antes abría la talanquera
        setScanResult({ valid: false, message: 'Código vencido' });
        toast.error('Acceso denegado: código vencido');
        addToHistory({
          id: crypto.randomUUID(),
          user: (data?.profiles?.full_name || 'Residente') + ' [Vencido]',
          domicile: data?.profiles?.apartment_number || '-',
          valid: false,
          timestamp: new Date().toLocaleTimeString()
        });
      } else if (decision.reason === 'unknown') {
        setScanResult({ valid: false, message: 'Código no registrado o revocado' });
        toast.error('Acceso denegado: código no válido');
        
        addToHistory({
          id: crypto.randomUUID(),
          user: 'Código desconocido',
          domicile: '-',
          valid: false,
          timestamp: new Date().toLocaleTimeString()
        });
      } else if (decision.reason === 'blocked') {
        const result = { 
          valid: false, 
          blocked: true,
          user: data.profiles.full_name,
          domicile: data.profiles.apartment_number,
          message: 'Residente suspendido por morosidad',
          timestamp: new Date().toLocaleTimeString()
        };
        setScanResult(result);
        toast.error('Residente suspendido: acceso denegado');
        
        addToHistory({
          id: crypto.randomUUID(),
          user: (data.profiles.full_name || 'Residente') + ' [Suspendido]',
          domicile: data.profiles.apartment_number || '-',
          valid: false,
          timestamp: result.timestamp
        });
      } else {
        const result = { 
          valid: true, 
          user: data.profiles?.full_name || 'Residente autorizado',
          domicile: data.profiles?.apartment_number || 'S/N',
          timestamp: new Date().toLocaleTimeString()
        };
        setScanResult(result);
        toast.success('Acceso autorizado');
        
        addToHistory({
          id: crypto.randomUUID(),
          user: data.profiles?.full_name || 'Residente',
          domicile: data.profiles?.apartment_number || '-',
          valid: true,
          timestamp: result.timestamp
        });
      }
    } catch (err) {
      toast.error("Error al conectar con la base de datos de portería");
    } finally {
      setIsVerifying(false);
    }
  };

  const addToHistory = (item: ScanHistoryItem) => {
    setHistory(prev => [item, ...prev].slice(0, 10));
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-5xl mx-auto pb-12">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[13px] font-medium text-primary">
              Seguridad
            </span>
          </div>
          <h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold text-foreground tracking-tight">
            Garita QR
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base font-medium">
            Apunta la cámara al código del residente para confirmar si puede ingresar.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Scanner Section */}
          <div className="lg:col-span-8 space-y-6">
            {!scannerActive && !scanResult && !isVerifying && (
              <div className="p-8 sm:p-14 rounded-2xl bg-card text-center space-y-6 shadow-hairline">
                <div className="w-24 h-24 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary">
                  <Camera className="w-12 h-12" />
                </div>
                <div>
                  <h3 className="text-2xl font-semibold text-foreground">Escáner</h3>
                  <p className="text-sm text-muted-foreground font-medium mt-1 max-w-sm mx-auto">
                    Presiona el botón para encender la cámara frontal o trasera del dispositivo
                  </p>
                </div>

                <Button 
                  size="lg" 
                  onClick={startScanner} 
                  className="h-16 px-10 rounded-xl font-semibold text-base shadow-md gap-2"
                >
                  <Camera className="w-5 h-5" />
                  Encender cámara
                </Button>
                
                {hasCamera === false && (
                  <div className="flex items-center justify-center gap-2 text-amber-600 bg-amber-500/10 px-4 py-2.5 rounded-xl border border-amber-500/20 max-w-md mx-auto">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <p className="text-xs font-semibold">No se detectó cámara o el sitio no se encuentra bajo HTTPS.</p>
                  </div>
                )}
              </div>
            )}

            {isVerifying && (
              <div className="p-16 rounded-2xl bg-card flex flex-col items-center justify-center gap-4 text-center shadow-hairline">
                <Loader2 className="w-14 h-14 animate-spin text-primary" />
                <h3 className="text-xl font-semibold text-foreground">Verificando…</h3>
                <p className="text-xs text-muted-foreground font-medium">Verificando estado de morosidad y permisos...</p>
              </div>
            )}

            {scannerActive && (
              <div className="rounded-2xl border border-border/80 bg-black overflow-hidden shadow-md">
                <div className="p-4 bg-slate-900 border-b border-border/40 flex items-center justify-between text-white">
                  <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span>Cámara activa</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={stopScanner}
                    className="h-8 px-3 text-xs font-semibold text-white hover:bg-white/10"
                  >
                    Cerrar cámara
                  </Button>
                </div>

                <div className="aspect-square sm:aspect-video bg-black relative flex items-center justify-center">
                  <div id="reader" className="w-full h-full"></div>
                </div>

                <div className="p-4 bg-card border-t border-border/70 flex justify-center">
                  <Button 
                    variant="outline" 
                    onClick={stopScanner} 
                    className="h-12 px-6 rounded-xl font-semibold text-xs border gap-2"
                  >
                    <RefreshCcw className="w-4 h-4" />
                    Cancelar lectura
                  </Button>
                </div>
              </div>
            )}

            {/* Scan Result Card */}
            {scanResult && (
              <div className={`p-6 sm:p-8 rounded-2xl border shadow-sm space-y-6 ${
                scanResult.valid 
                  ? 'border-emerald-500 bg-emerald-500/[0.03]' 
                  : scanResult.blocked 
                    ? 'border-amber-500 bg-amber-500/[0.03]' 
                    : 'border-rose-500 bg-rose-500/[0.03]'
              }`}>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-border/70 pb-5">
                  <div className="flex items-center gap-4 text-center sm:text-left">
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center font-semibold ${
                      scanResult.valid 
                        ? 'bg-emerald-500 text-white shadow-md' 
                        : scanResult.blocked 
                          ? 'bg-amber-500 text-white shadow-md' 
                          : 'bg-rose-500 text-white shadow-md'
                    }`}>
                      {scanResult.valid ? <ShieldCheck className="w-9 h-9" /> : <ShieldAlert className="w-9 h-9" />}
                    </div>
                    <div>
                      <h3 className={`text-2xl sm:text-3xl font-semibold tracking-tight ${
                        scanResult.valid ? 'text-emerald-700 dark:text-emerald-400' : scanResult.blocked ? 'text-amber-700 dark:text-amber-400' : 'text-rose-700 dark:text-rose-400'
                      }`}>
                        {scanResult.valid ? 'Acceso autorizado' : scanResult.blocked ? 'Residente en mora' : 'Acceso denegado'}
                      </h3>
                      <p className="text-xs sm:text-sm text-muted-foreground font-medium mt-0.5">
                        {scanResult.valid 
                          ? 'Al día · Puede ingresar'
                          : scanResult.blocked 
                            ? 'Tiene cuotas pendientes · Avisar a la administración'
                            : 'Código no reconocido o caducado'}
                      </p>
                    </div>
                  </div>

                  <Button 
                    size="lg" 
                    onClick={startScanner} 
                    className="h-12 px-6 text-[15px]"
                  >
                    Nuevo escaneo
                  </Button>
                </div>

                {(scanResult.valid || scanResult.blocked) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-border/80 bg-background flex items-center gap-3">
                      <div className="flex items-center justify-center text-muted-foreground">
                        <User className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Nombre residente</p>
                        <p className="text-base font-semibold text-foreground mt-0.5">{scanResult.user}</p>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-border/80 bg-background flex items-center gap-3">
                      <div className="flex items-center justify-center text-muted-foreground">
                        <Home className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Departamento</p>
                        <p className="text-base font-semibold text-foreground mt-0.5">Apto {scanResult.domicile}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Shift Log */}
          <div className="lg:col-span-4 space-y-6">
            <div className="rounded-2xl bg-card overflow-hidden shadow-hairline">
              <div className="p-4 bg-muted/40 border-b border-border/70 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-xs text-foreground">Bitácora del turno</h3>
                </div>
                <span className="text-xs font-medium text-muted-foreground">Últimos 10</span>
              </div>

              <div className="p-4 space-y-3 max-h-[460px] overflow-y-auto">
                {history.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-xs font-medium">
                    Sin escaneos registrados en esta sesión.
                  </div>
                ) : (
                  history.map((item) => (
                    <div 
                      key={item.id} 
                      className="p-3 rounded-xl border border-border/70 bg-background flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${item.valid ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{item.user}</p>
                          <p className="text-xs text-muted-foreground font-medium">Apto {item.domicile} • {item.timestamp}</p>
                        </div>
                      </div>

                      <span className={`text-xs font-semibold uppercase px-2 py-0.5 rounded-md ${
                        item.valid ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-600'
                      }`}>
                        {item.valid ? 'Paso OK' : 'Denegado'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-card space-y-2 text-xs font-medium text-muted-foreground shadow-hairline">
              <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                <ShieldCheck className="w-4 h-4" />
                <span>Auditoría de seguridad</span>
              </div>
              <p className="leading-relaxed">
                Cada validación queda registrada con fecha y hora.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default VerifyQR;
