import { useState, useEffect, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Palette, Building2, Upload, Loader2, Monitor, Smartphone, Layout, Check, Globe, Image as ImageIcon, Trash2, Sparkles, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

const PRESET_COLORS = [
  { name: "Azul Residencial", hex: '#1168bd' },
  { name: "Azul Marino", hex: '#1e40af' },
  { name: "Azul Cielo", hex: '#0284c7' },
  { name: "Verde Esmeralda", hex: '#059669' },
  { name: "Verde Bosque", hex: '#0f766e' },
  { name: "Púrpura Elegante", hex: '#7c3aed' },
  { name: "Ámbar Dorado", hex: '#d97706' },
  { name: "Borgoña / Terracota", hex: '#b91c1c' },
];

const AdminSettings = () => {
  const { settings, updateSettings, previewTheme, loading } = useTheme();
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

  // Aplicar previsualización en caliente cuando cambie color o nombre
  const handleColorChange = (color: string) => {
    setFormData(prev => ({ ...prev, primary_color: color }));
    previewTheme({ primary_color: color });
  };

  const handleNameChange = (name: string) => {
    setFormData(prev => ({ ...prev, company_name: name }));
    previewTheme({ company_name: name });
  };

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
        toast.error('No se pudo subir la imagen: ' + uploadError.message);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, logo_url: publicUrl }));
      previewTheme({ logo_url: publicUrl });
      toast.success('Logo subido con éxito');
    } catch (err) {
      console.error('File upload exception:', err);
      toast.error('Ocurrió un error inesperado al subir el archivo');
    } finally {
      setIsUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = () => {
    setFormData(prev => ({ ...prev, logo_url: '' }));
    previewTheme({ logo_url: null });
    toast.info('Logotipo quitado. Guarda los cambios para aplicarlo.');
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
      toast.success('Cambios guardados.');
    } catch (error) {
      toast.error('Error al guardar la configuración: ' + (error instanceof Error ? error.message : 'Revisa permisos de base de datos'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-7xl mx-auto pb-20">
        {/* Header */}
        <div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary">
                  Ajustes
                </span>
                <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  Cambios en vivo
                </span>
              </div>
              <h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold text-foreground tracking-tight flex items-center gap-3">
                <Palette className="w-9 h-9 text-primary" />
                Marca del conjunto
              </h1>
              <p className="text-muted-foreground text-base md:text-lg font-medium mt-1">
                Ajusta el nombre, el logotipo y el color principal. Los cambios se aplican en todos los dispositivos.
              </p>
            </div>

            <Button 
              onClick={handleSave} 
              disabled={isSaving || loading} 
              size="lg" 
              className="h-12 px-6 text-[15px]"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  <span>Guardar y aplicar</span>
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Form */}
          <div className="lg:col-span-7 space-y-6">
            {/* Tarjeta Nombre y Logo */}
            <div className="bg-card rounded-2xl p-6 sm:p-8 space-y-6 shadow-hairline">
              <div className="flex items-center gap-3 pb-4 border-b border-border/60">
                <div className="flex items-center justify-center text-muted-foreground">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Identidad del conjunto</h2>
                  <p className="text-xs font-medium text-muted-foreground">Nombre oficial y emblema institucional</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-settings-nombre-del-conjunto-o-urbanizaci" className="text-xs font-medium text-muted-foreground">
                  Nombre del Conjunto o Urbanización *
                </Label>
                <Input id="admin-settings-nombre-del-conjunto-o-urbanizaci"
                  value={formData.company_name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="ej. Gestor Residencial — Gissel's 2"
                  className="h-12 text-lg"
                />
              </div>
              
              {/* Uploader de Logotipo */}
              <div className="space-y-3">
                <Label htmlFor="admin-settings-logotipo-oficial" className="text-xs font-medium text-muted-foreground">
                  Logotipo oficial
                </Label>
                
                <input id="admin-settings-logotipo-oficial"
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center p-4 rounded-xl bg-muted/30 border border-border/60">
                  <div 
                    className="w-20 h-20 rounded-xl border border-border/80 flex items-center justify-center overflow-hidden flex-shrink-0"
                    style={{ backgroundColor: formData.primary_color }}
                  >
                    {formData.logo_url ? (
                      <img src={formData.logo_url} alt="Logo preview" className="w-full h-full object-contain p-2" />
                    ) : (
                      <Building2 className="w-9 h-9 text-white" />
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
                        className="rounded-xl font-semibold gap-2 h-10 px-4 border-border/80"
                      >
                        {isUploadingLogo ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        Subir imagen
                      </Button>
                      
                      {formData.logo_url && (
                        <Button 
                          type="button"
                          variant="ghost" 
                          size="sm"
                          onClick={handleRemoveLogo}
                          className="rounded-xl text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 font-semibold gap-1.5 h-10 px-3"
                        >
                          <Trash2 className="w-4 h-4" />
                          Remover
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-medium">
                      Formatos soportados: PNG, JPG, SVG o WEBP (máx. 3 MB)
                    </p>
                  </div>
                </div>

                {/* URL manual alternativa */}
                <div className="relative pt-1">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                  <Input
                    value={formData.logo_url}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, logo_url: e.target.value }));
                      previewTheme({ logo_url: e.target.value });
                    }}
                    placeholder="O ingresa un enlace web directo: https://.../logo.png"
                    className="h-11 bg-background border border-border/60 rounded-xl pl-11 text-xs font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Tarjeta de Color Principal */}
            <div className="bg-card rounded-2xl p-6 sm:p-8 space-y-6 shadow-hairline">
              <div className="flex items-center gap-3 pb-4 border-b border-border/60">
                <div className="flex items-center justify-center text-muted-foreground">
                  <Layout className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Color principal de marca</h2>
                  <p className="text-xs font-medium text-muted-foreground">Define los acentos visuales, botones y navegación</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-3">
                    Colores sugeridos
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {PRESET_COLORS.map(color => {
                      const isSelected = formData.primary_color.toLowerCase() === color.hex.toLowerCase();
                      return (
                        <button
                          key={color.hex}
                          type="button"
                          onClick={() => handleColorChange(color.hex)}
                          className={`p-3 rounded-xl border flex items-center gap-2.5 transition-[color,background-color,border-color,box-shadow,opacity,transform] text-left ${
                            isSelected 
                              ? 'border-foreground shadow-md bg-muted/60 scale-[1.02]' 
                              : 'border-border/60 hover:border-border/90 bg-card'
                          }`}
                        >
                          <div 
                            className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm"
                            style={{ backgroundColor: color.hex }}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                          </div>
                          <span className="text-xs font-semibold text-foreground truncate">{color.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-xl border border-border/60">
                  <input 
                    type="color"
                    value={formData.primary_color}
                    onChange={(e) => handleColorChange(e.target.value)}
                    className="w-14 h-14 rounded-xl border border-border/80 cursor-pointer bg-transparent overflow-hidden"
                  />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Color personalizado (hex)
                    </p>
                    <Input
                      value={formData.primary_color}
                      onChange={(e) => handleColorChange(e.target.value)}
                      className="h-10 bg-background border border-border/80 text-base font-semibold px-3 rounded-lg w-36"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Previews */}
          <div className="lg:col-span-5 space-y-6">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-medium text-muted-foreground">
                Vista previa
              </h3>
              <span className="text-xs font-semibold text-primary flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                Reactivo al instante
              </span>
            </div>
            
            {/* Desktop Mockup */}
            <div className="bg-card rounded-2xl p-5 space-y-4 shadow-hairline">
              <p className="text-xs font-medium text-muted-foreground">
                Vista del residente
              </p>

              <div className="rounded-xl overflow-hidden border border-slate-900 bg-slate-950 p-3 space-y-3 shadow-lg">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-7 h-7 rounded-lg flex items-center justify-center overflow-hidden"
                      style={{ backgroundColor: formData.primary_color }}
                    >
                      {formData.logo_url ? (
                        <img src={formData.logo_url} className="w-full h-full object-contain p-0.5" />
                      ) : (
                        <Building2 className="w-4 h-4 text-white" />
                      )}
                    </div>
                    <span className="text-xs font-semibold text-white truncate max-w-[180px]">
                      {formData.company_name || 'Gissel\'s 2'}
                    </span>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                </div>

                <div className="bg-slate-900 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-400">Alícuota del mes</span>
                    <span className="text-xs font-semibold text-emerald-400">Al día</span>
                  </div>
                  <p className="text-xl font-semibold text-white">$50.00</p>
                  <Button 
                    size="sm" 
                    className="w-full h-8 rounded-lg font-semibold text-xs text-white shadow-sm"
                    style={{ backgroundColor: formData.primary_color }}
                  >
                    Subir comprobante
                  </Button>
                </div>
              </div>
            </div>

            {/* Note on Persistence */}
            <div className="bg-muted/40 rounded-2xl border border-border/80 p-5 space-y-2 text-xs font-medium text-muted-foreground leading-relaxed">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-600" />
                Se guarda para todos
              </p>
              <p>
                Al hacer click en <strong>"Guardar y aplicar"</strong>, los valores se almacenan en la tabla <code className="font-mono text-primary font-semibold">system_settings</code> y en el almacenamiento local. Todos los residentes que abran la aplicación verán la nueva imagen corporativa sin necesidad de reiniciar el servidor.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AdminSettings;
