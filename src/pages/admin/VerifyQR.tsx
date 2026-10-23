import { useEffect, useState, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '@/integrations/supabase/client';
import { ShieldCheck, ShieldAlert, User, Home, Clock, QrCode, Loader2, Camera, History, RefreshCcw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ScanHistoryItem {
  id: string;
  user: string;
  domicile: string;
  valid: boolean;
  timestamp: string;
}

const VerifyQR = () => {
  const [scanResult, setScanResult] = useState<any>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    // Check for cameras on mount
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
    
    // Give DOM time to render the 'reader' div
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
          () => { /* errores de lectura frame a frame: ignorar */ }
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
    try {
      const data = JSON.parse(decodedText);
      if (data.t) {
        verifyToken(data.t);
      } else {
        verifyToken(decodedText);
      }
    } catch (e) {
      verifyToken(decodedText);
    }
  };

  const verifyToken = async (token: string) => {
    setIsVerifying(true);
    
    try {
      const { data, error } = await supabase
        .from('access_tokens')
        .select('*, profiles(full_name, apartment_number, status)')
        .eq('token', token)
        .single();

      if (error || !data) {
        setScanResult({ valid: false, message: 'Código inválido o expirado' });
        toast.error('Acceso Denegado');
        
        addToHistory({
          id: crypto.randomUUID(),
          user: 'Desconocido / Inválido',
          domicile: '-',
          valid: false,
          timestamp: new Date().toLocaleTimeString()
        });
      } else if (data.profiles?.status === 'blocked') {
        // User is blocked (delinquent)
        const result = { 
          valid: false, 
          blocked: true,
          user: data.profiles.full_name,
          domicile: data.profiles.apartment_number,
          message: 'MOROSO — ACCESO DENEGADO',
          timestamp: new Date().toLocaleTimeString()
        };
        setScanResult(result);
        toast.error('Residente Bloqueado — Acceso Denegado');
        
        addToHistory({
          id: crypto.randomUUID(),
          user: (data.profiles.full_name || 'Residente') + ' ⛔',
          domicile: data.profiles.apartment_number || '-',
          valid: false,
          timestamp: result.timestamp
        });
      } else {
        const result = { 
          valid: true, 
          user: data.profiles.full_name,
          domicile: data.profiles.apartment_number,
          timestamp: new Date().toLocaleTimeString()
        };
        setScanResult(result);
        toast.success('Acceso Autorizado');
        
        addToHistory({
          id: crypto.randomUUID(),
          user: data.profiles.full_name || 'Residente',
          domicile: data.profiles.apartment_number || '-',
          valid: true,
          timestamp: result.timestamp
        });
      }
    } catch (err) {
      toast.error("Error de conexión con el servidor");
    } finally {
      setIsVerifying(false);
    }
  };

  const addToHistory = (item: ScanHistoryItem) => {
    setHistory(prev => [item, ...prev].slice(0, 10));
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-4xl mx-auto pb-20">
        <div className="text-center">
          <h1 className="font-display text-4xl font-black flex items-center justify-center gap-4 text-foreground tracking-tight">
            <div className="p-2 bg-primary/10 rounded-xl">
              <QrCode className="w-8 h-8 text-primary" />
            </div>
            Verificador de Acceso
          </h1>
          <p className="text-muted-foreground mt-2 font-medium">
            Escanea el código QR del residente para validar su ingreso
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-6">
            {!scannerActive && !scanResult && !isVerifying && (
              <Card className="card-elevated border-none shadow-2xl bg-card/40 backdrop-blur-xl overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
                <CardContent className="flex flex-col items-center justify-center p-12 sm:p-20 space-y-8 relative z-10">
                  <div className="relative">
                    <div className="absolute -inset-6 bg-primary/20 rounded-full blur-3xl group-hover:bg-primary/30 transition-all duration-500" />
                    <div className="p-10 bg-white rounded-[2.5rem] shadow-2xl relative z-10 border-4 border-muted/50">
                      <Camera className="w-20 h-20 text-primary" />
                    </div>
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="text-2xl font-black">Escáner Listo</h3>
                    <p className="text-muted-foreground font-medium max-w-xs mx-auto">Asegúrate de estar en un lugar iluminado y usar HTTPS</p>
                  </div>
                  <Button 
                    size="lg" 
                    onClick={startScanner} 
                    className="rounded-2xl px-12 h-16 text-xl font-black shadow-xl shadow-primary/20 w-full sm:w-auto transition-transform active:scale-95"
                  >
                    ACTIVAR CÁMARA
                  </Button>
                  
                  {hasCamera === false && (
                    <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-2 rounded-xl border border-amber-200">
                      <AlertTriangle className="w-4 h-4" />
                      <p className="text-xs font-bold uppercase tracking-wider">No se detectó cámara o falta HTTPS</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {isVerifying && (
              <Card className="card-elevated flex flex-col items-center justify-center p-20 space-y-8 bg-card/40 backdrop-blur-xl border-none shadow-2xl">
                <div className="relative">
                  <div className="absolute -inset-4 bg-primary/20 rounded-full blur-xl animate-pulse" />
                  <Loader2 className="w-20 h-20 animate-spin text-primary relative z-10" />
                </div>
                <div className="text-center space-y-2">
                  <p className="text-2xl font-black uppercase tracking-[0.2em] text-primary">Validando</p>
                  <p className="text-muted-foreground font-medium">Sincronizando con base de datos...</p>
                </div>
              </Card>
            )}

            {scannerActive && (
              <Card className="card-elevated overflow-hidden border-none shadow-2xl bg-black rounded-[2rem] relative">
                <div className="absolute top-6 left-6 z-20 flex items-center gap-2 px-4 py-2 bg-primary/90 text-white rounded-full text-xs font-black tracking-widest uppercase backdrop-blur-md">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  VÍDEO EN VIVO
                </div>
                <div className="aspect-square sm:aspect-video bg-slate-900 relative">
                  <div id="reader" className="w-full h-full"></div>
                  {/* Scanner Overlay UI */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-64 h-64 border-2 border-primary/50 rounded-3xl relative">
                       <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                       <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                       <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                       <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl" />
                       <div className="absolute top-1/2 left-0 w-full h-0.5 bg-primary/30 animate-scan" />
                    </div>
                  </div>
                </div>
                <div className="p-8 bg-card flex justify-center border-t border-border/50">
                  <Button variant="ghost" onClick={stopScanner} className="rounded-2xl h-14 px-8 font-black text-muted-foreground hover:bg-muted/50 gap-2">
                    <RefreshCcw className="w-5 h-5" />
                    CANCELAR ESCANEO
                  </Button>
                </div>
              </Card>
            )}

            {scanResult && (
              <Card className={`card-elevated border-none shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 rounded-[2rem] ${scanResult.valid ? 'bg-emerald-50/50' : scanResult.blocked ? 'bg-amber-50/50' : 'bg-rose-50/50'}`}>
                <div className={`h-3 ${scanResult.valid ? 'bg-emerald-500' : scanResult.blocked ? 'bg-amber-500' : 'bg-rose-500'}`} />
                <CardHeader className="p-8 sm:p-10">
                  <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-8">
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                      <div className={cn(
                        "p-6 rounded-[2rem] shadow-2xl transition-transform hover:scale-110",
                        scanResult.valid ? "bg-emerald-500 shadow-emerald-200 text-white" 
                          : scanResult.blocked ? "bg-amber-500 shadow-amber-200 text-white"
                          : "bg-rose-500 shadow-rose-200 text-white"
                      )}>
                        {scanResult.valid ? <ShieldCheck className="w-12 h-12" /> : <ShieldAlert className="w-12 h-12" />}
                      </div>
                      <div className="text-center sm:text-left space-y-1">
                        <CardTitle className={cn(
                          "text-4xl font-black tracking-tight",
                          scanResult.valid ? "text-emerald-900" 
                            : scanResult.blocked ? "text-amber-900"
                            : "text-rose-900"
                        )}>
                          {scanResult.valid ? 'AUTORIZADO' : scanResult.blocked ? 'MOROSO' : 'DENEGADO'}
                        </CardTitle>
                        <CardDescription className="text-lg font-bold opacity-80">
                          {scanResult.valid ? 'Credencial vigente y verificada' 
                            : scanResult.blocked ? 'Residente con deuda pendiente — Acceso bloqueado'
                            : 'Acceso no permitido en sistema'}
                        </CardDescription>
                      </div>
                    </div>
                    <Button 
                      size="lg"
                      onClick={startScanner} 
                      className="rounded-2xl font-black px-12 h-16 shadow-lg active:scale-95 w-full sm:w-auto"
                    >
                      NUEVO ESCANEO
                    </Button>
                  </div>
                </CardHeader>
                
                {/* Show user info for authorized OR blocked scans */}
                {(scanResult.valid || scanResult.blocked) && (
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 sm:p-10 pt-0">
                    <div className={`flex items-center gap-5 bg-white p-6 rounded-[2rem] shadow-sm border ${scanResult.valid ? 'border-emerald-100/50' : 'border-amber-100/50'}`}>
                      <div className={`p-4 rounded-2xl ${scanResult.valid ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                        <User className="w-7 h-7" />
                      </div>
                      <div>
                        <p className={`text-[10px] uppercase font-black tracking-widest mb-1 ${scanResult.valid ? 'text-emerald-600' : 'text-amber-600'}`}>Nombre Residente</p>
                        <p className="text-2xl font-bold text-slate-900 leading-tight">{scanResult.user}</p>
                      </div>
                    </div>
                    <div className={`flex items-center gap-5 bg-white p-6 rounded-[2rem] shadow-sm border ${scanResult.valid ? 'border-blue-100/50' : 'border-rose-100/50'}`}>
                      <div className={`p-4 rounded-2xl ${scanResult.valid ? 'bg-blue-100 text-blue-600' : 'bg-rose-100 text-rose-600'}`}>
                        <Home className="w-7 h-7" />
                      </div>
                      <div>
                        <p className={`text-[10px] uppercase font-black tracking-widest mb-1 ${scanResult.valid ? 'text-blue-600' : 'text-rose-600'}`}>Ubicación</p>
                        <p className="text-2xl font-bold text-slate-900 leading-tight">Unidad {scanResult.domicile}</p>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            )}
          </div>

          <div className="lg:col-span-4 space-y-6">
            <Card className="card-elevated border-none shadow-2xl bg-card/40 backdrop-blur-xl rounded-[2rem] overflow-hidden">
              <CardHeader className="bg-muted/30 border-b border-border/50 pb-4">
                <CardTitle className="text-xl font-black flex items-center gap-3">
                  <History className="w-6 h-6 text-primary" />
                  Historial de Turno
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4 max-h-[500px] overflow-y-auto scrollbar-custom">
                {history.length === 0 ? (
                  <div className="text-center py-20 space-y-4">
                    <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto">
                      <QrCode className="w-8 h-8 text-muted-foreground/30" />
                    </div>
                    <p className="text-sm text-muted-foreground font-bold uppercase tracking-widest">Sin registros recientes</p>
                  </div>
                ) : (
                  history.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-4 rounded-2xl bg-white border border-border/50 hover:shadow-md transition-all group">
                      <div className="flex items-center gap-4">
                        <div className={`w-3 h-3 rounded-full ${item.valid ? 'bg-emerald-500' : 'bg-rose-500'} shadow-[0_0_10px_rgba(0,0,0,0.1)]`} />
                        <div>
                          <p className="text-sm font-black text-slate-900 group-hover:text-primary transition-colors">{item.user}</p>
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter mt-0.5">{item.domicile} • {item.timestamp}</p>
                        </div>
                      </div>
                      <div className={cn(
                        "p-2 rounded-lg",
                        item.valid ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                      )}>
                        {item.valid ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="card-elevated border-none shadow-2xl bg-slate-900 text-white p-8 rounded-[2rem] relative overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 blur-[60px] rounded-full" />
               <div className="relative z-10 space-y-4">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6 text-primary" />
                  </div>
                  <h4 className="text-xl font-black tracking-tight">Registro de Auditoría</h4>
                  <p className="text-sm text-white/60 font-medium leading-relaxed">
                    Cada escaneo exitoso o fallido se guarda en el registro central para control de seguridad y reportes de gerencia.
                  </p>
               </div>
            </Card>
          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes scan {
          0% { transform: translateY(0); }
          50% { transform: translateY(256px); }
          100% { transform: translateY(0); }
        }
        .animate-scan {
          animation: scan 3s linear infinite;
        }
        .scrollbar-custom::-webkit-scrollbar {
          width: 6px;
        }
        .scrollbar-custom::-webkit-scrollbar-thumb {
          background: hsl(var(--muted));
          border-radius: 10px;
        }
      `}</style>
    </DashboardLayout>
  );
};

export default VerifyQR;
