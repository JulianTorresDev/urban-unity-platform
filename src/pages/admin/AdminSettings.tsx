import { useState, useEffect, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Palette, Building2, Upload, Loader2, Monitor, Smartphone, Layout, Check, Globe, Image as ImageIcon, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';

const PRESET_COLORS = [
  '#1168bd', // Gissel's 2 Blue
  '#2563eb', // Royal Blue
  '#0284c7', // Sky Blue
  '#0f766e', // Deep Teal
  '#059669', // Emerald Green
  '#7c3aed', // Purple
  '#d97706', // Amber Gold
  '#dc2626', // Crimson Red
];

const AdminSettings = () => {
  const { settings, updateSettings, loading } = useTheme();
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    company_name: '',
    primary_color: '',
    secondary_color: '',
    logo_url: '',
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        company_name: settings.company_name || "Gestor Residencial — Gissel's 2",
        primary_color: settings.primary_color || '#1168bd',
        secondary_color: settings.secondary_color || '#1e293b',
        logo_url: settings.logo_url || '',
      });
    }
  }, [settings]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor selecciona una imagen válida (PNG, JPG, SVG o WEBP)');
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      toast.error('El tamaño de la imagen no debe superar los 3 MB');
      return;
    }

    setIsUploadingLogo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        toast.error('Error al subir la imagen a Supabase Storage: ' + uploadError.message);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, logo_url: publicUrl }));
      toast.success('Logo subido con éxito');
    } catch (err: any) {
      console.error('File upload exception:', err);
      toast.error('Ocurrió un error inesperado al subir el archivo');
    } finally {
      setIsUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = () => {
    setFormData(prev => ({ ...prev, logo_url: '' }));
    toast.info('Logo removido. Guarda los cambios para aplicar.');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company_name.trim()) {
      toast.error('El nombre de la comunidad no puede estar vacío');
      return;
    }

    setIsSaving(true);
    try {
      await updateSettings(formData);
      toast.success('Configuración guardada y aplicada en todo el sistema');
    } catch (error: any) {
      toast.error('Error al guardar la configuración: ' + (error?.message || 'Revisa permisos de base de datos'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-10 max-w-6xl mx-auto pb-20">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-6"
        >
          <div>
            <h1 className="font-display text-4xl font-black flex items-center gap-4 text-foreground tracking-tight">
              <div className="p-3 bg-primary/10 rounded-2xl">
                <Palette className="w-8 h-8 text-primary" />
              </div>
              Personalización del Sistema
            </h1>
            <p className="text-muted-foreground mt-2 text-lg font-medium">
              Ajusta la marca, el logo y los colores corporativos para todos los residentes
            </p>
          </div>
          <Button 
            onClick={handleSave} 
            disabled={isSaving || loading} 
            size="lg" 
            className="rounded-2xl px-10 h-14 font-black shadow-xl shadow-primary/20 transition-all hover:scale-105"
          >
            {isSaving ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <Check className="w-5 h-5 mr-2" />
            )}
            GUARDAR Y APLICAR
          </Button>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Form */}
          <div className="lg:col-span-7 space-y-8">
            <Card className="card-elevated border-none shadow-2xl bg-card/40 backdrop-blur-xl overflow-hidden">
              <div className="h-2 bg-primary" />
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-black flex items-center gap-3">
                  <Building2 className="w-5 h-5 text-primary" />
                  Identidad Residencial
                </CardTitle>
                <CardDescription className="font-bold">Nombre oficial y logotipo del conjunto</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-2">
                <div className="grid gap-3">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                    Nombre del Conjunto o Urbanización *
                  </Label>
                  <Input
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    placeholder="ej. Gestor Residencial — Gissel's 2"
                    className="h-14 bg-muted/30 border-none rounded-2xl focus:ring-primary/20 text-lg font-bold"
                  />
                </div>
                
                {/* Logo Uploader */}
                <div className="grid gap-3">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                    Logotipo Oficial
                  </Label>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center p-4 rounded-2xl bg-muted/30 border border-border/50">
                    <div className="w-20 h-20 rounded-2xl bg-background border-2 border-border/50 flex items-center justify-center overflow-hidden shadow-inner flex-shrink-0">
                      {formData.logo_url ? (
                        <img src={formData.logo_url} alt="Logo preview" className="w-full h-full object-contain p-2" />
                      ) : (
                        <Building2 className="w-8 h-8 text-muted-foreground/40" />
                      )}
                    </div>
                    
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Button 
                          type="button"
                          variant="outline" 
                          size="sm"
                          disabled={isUploadingLogo}
                          onClick={() => fileInputRef.current?.click()}
                          className="rounded-xl font-bold gap-2"
                        >
                          {isUploadingLogo ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4" />
                          )}
                          Subir desde mi PC
                        </Button>
                        
                        {formData.logo_url && (
                          <Button 
                            type="button"
                            variant="ghost" 
                            size="sm"
                            onClick={handleRemoveLogo}
                            className="rounded-xl text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 font-bold gap-1"
                          >
                            <Trash2 className="w-4 h-4" />
                            Quitar
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-medium">
                        Recomendado: archivo PNG o SVG transparente (máx. 3 MB)
                      </p>
                    </div>
                  </div>

                  {/* Manual URL fallback */}
                  <div className="relative pt-2">
                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                    <Input
                      value={formData.logo_url}
                      onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                      placeholder="O ingresa un enlace web directo: https://.../logo.png"
                      className="h-11 bg-muted/20 border-none rounded-xl pl-11 text-xs font-medium"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="card-elevated border-none shadow-2xl bg-card/40 backdrop-blur-xl overflow-hidden">
              <div className="h-2 bg-primary/40" />
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-black flex items-center gap-3">
                  <Layout className="w-5 h-5 text-primary" />
                  Color Principal de Marca
                </CardTitle>
                <CardDescription className="font-bold">Color dominante para botones, insignias y navegación</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-2">
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3 mb-4">
                    {PRESET_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData({ ...formData, primary_color: color })}
                        className="w-11 h-11 rounded-2xl border-2 border-white shadow-md transition-transform hover:scale-110 relative flex items-center justify-center"
                        style={{ backgroundColor: color }}
                      >
                        {formData.primary_color.toLowerCase() === color.toLowerCase() && (
                          <Check className="w-5 h-5 text-white" strokeWidth={3} />
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-4 items-center bg-muted/30 p-4 rounded-2xl border border-border/50">
                    <input 
                      type="color"
                      value={formData.primary_color}
                      onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                      className="w-14 h-14 rounded-xl border-2 border-white shadow-md cursor-pointer bg-transparent overflow-hidden"
                    />
                    <div className="flex-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
                        Código Hexadecimal Personalizado
                      </p>
                      <Input
                        value={formData.primary_color}
                        onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                        className="h-10 bg-transparent border-none text-xl font-black p-0 focus:ring-0 uppercase tracking-wider"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Real-time Previews */}
          <div className="lg:col-span-5 space-y-8">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground ml-2">
              Previsualización en tiempo real
            </h3>
            
            {/* Desktop Mockup */}
            <Card className="border-none shadow-2xl rounded-[2rem] overflow-hidden bg-background aspect-video relative group border-4 border-slate-900">
              <div className="absolute inset-0 flex">
                {/* Sidebar */}
                <div className="w-1/3 h-full bg-slate-900 p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-7 h-7 rounded-lg shadow-inner flex items-center justify-center overflow-hidden flex-shrink-0"
                      style={{ backgroundColor: formData.primary_color }}
                    >
                      {formData.logo_url ? (
                        <img src={formData.logo_url} className="w-full h-full object-contain p-0.5" />
                      ) : (
                        <Building2 className="w-4 h-4 text-white" />
                      )}
                    </div>
                    <p className="text-[9px] font-black text-white truncate leading-tight">
                      {formData.company_name || 'Gissel\'s 2'}
                    </p>
                  </div>
                  <div className="space-y-1.5 pt-2">
                    <div className="h-6 w-full rounded-md flex items-center px-2 text-[8px] font-black text-white" style={{ backgroundColor: formData.primary_color }}>
                      Inicio
                    </div>
                    <div className="h-6 w-full rounded-md bg-white/5" />
                    <div className="h-6 w-full rounded-md bg-white/5" />
                  </div>
                </div>

                {/* Main View */}
                <div className="flex-1 h-full bg-slate-50 p-4 space-y-3 overflow-hidden">
                  <div className="flex justify-between items-center">
                    <p className="text-xs font-black text-slate-800">Panel Principal</p>
                    <div className="w-6 h-6 rounded-full bg-slate-200" />
                  </div>
                  <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-200">
                    <p className="text-[10px] text-slate-400 font-bold">Alícuotas al día</p>
                    <p className="text-lg font-black" style={{ color: formData.primary_color }}>$120.00</p>
                  </div>
                  <Button size="sm" className="w-full rounded-xl text-[10px] h-7 font-black" style={{ backgroundColor: formData.primary_color }}>
                    Verificar Recibos
                  </Button>
                </div>
              </div>
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                <Monitor className="w-8 h-8 text-white mr-2" />
                <p className="font-black text-white text-[11px] tracking-widest uppercase">Vista Escritorio</p>
              </div>
            </Card>

            {/* Mobile Mockup */}
            <div className="flex justify-center">
              <div className="w-56 aspect-[9/18] bg-slate-900 rounded-[2.5rem] p-2.5 shadow-2xl relative border-4 border-slate-800">
                <div className="w-16 h-4 bg-slate-900 absolute top-0 left-1/2 -translate-x-1/2 rounded-b-xl z-10" />
                <div className="w-full h-full bg-white rounded-[2rem] overflow-hidden flex flex-col">
                  <div className="p-3 flex items-center justify-between border-b border-slate-100">
                    <div 
                      className="w-7 h-7 rounded-lg flex items-center justify-center overflow-hidden"
                      style={{ backgroundColor: formData.primary_color }}
                    >
                      {formData.logo_url ? (
                        <img src={formData.logo_url} className="w-full h-full object-contain p-0.5" />
                      ) : (
                        <Building2 className="w-3.5 h-3.5 text-white" />
                      )}
                    </div>
                    <div className="w-6 h-6 rounded-full bg-slate-100" />
                  </div>
                  <div className="p-3 space-y-3 flex-1">
                    <p className="text-[10px] font-black text-slate-800 truncate">
                      {formData.company_name || 'Gissel\'s 2'}
                    </p>
                    <div className="p-3 rounded-xl border border-slate-200 shadow-sm" style={{ backgroundColor: formData.primary_color + '10' }}>
                      <p className="text-[8px] font-bold text-slate-500">Próxima Cuota</p>
                      <p className="text-sm font-black" style={{ color: formData.primary_color }}>$50.00</p>
                    </div>
                    <Button className="w-full rounded-xl h-8 font-black text-[9px]" style={{ backgroundColor: formData.primary_color }}>
                      Subir Comprobante
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AdminSettings;
