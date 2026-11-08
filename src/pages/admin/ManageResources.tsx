import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Settings, Loader2, TreesIcon, Building, Car, DollarSign, Edit, Clock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { formatUSD } from '@/lib/format';

interface Resource {
  id: string;
  name: string;
  description: string | null;
  base_price: number | null;
  price_per_hour: number | null;
  max_hours_per_booking: number | null;
  available_from: string | null;
  available_until: string | null;
}

const resourceIcons: Record<string, { icon: LucideIcon; color: string; bg: string; border: string; label?: string }> = {
  'Zonas Verdes': { icon: TreesIcon, color: 'text-emerald-600', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  'Salón Social': { icon: Building, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' },
  'Parqueadero Visitantes': { icon: Car, color: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
};

const ManageResources = () => {
  const { isAdmin } = useAuth();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    description: '',
    base_price: '0',
    price_per_hour: '0',
    max_hours_per_booking: '4',
  });

  const fetchResources = async () => {
    try {
      const { data } = await supabase.from('resources').select('*');
      if (data) setResources(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, []);

  const openEditDialog = (resource: Resource) => {
    setEditingResource(resource);
    setFormData({
      description: resource.description || '',
      base_price: (resource.base_price || 0).toString(),
      price_per_hour: (resource.price_per_hour || 0).toString(),
      max_hours_per_booking: (resource.max_hours_per_booking || 4).toString(),
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingResource) return;
    const basePrice = parseFloat(formData.base_price || '0');
    const perHour = parseFloat(formData.price_per_hour || '0');
    const maxHours = parseInt(formData.max_hours_per_booking);
    if (!(basePrice >= 0) || !(perHour >= 0)) {
      toast.error('Los precios no pueden ser negativos');
      return;
    }
    if (!(maxHours >= 1 && maxHours <= 24)) {
      toast.error('El máximo por reserva debe estar entre 1 y 24 horas');
      return;
    }
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('resources')
        .update({
          description: formData.description.trim(),
          base_price: basePrice,
          price_per_hour: perHour,
          max_hours_per_booking: maxHours,
        })
        .eq('id', editingResource.id);

      if (error) {
        toast.error('Error al actualizar área común');
      } else {
        toast.success('Configuración actualizada con éxito');
        fetchResources();
        setIsDialogOpen(false);
      }
    } catch (err) {
      toast.error('Ocurrió un error inesperado');
    } finally {
      setIsSaving(false);
    }
  };

  const formatPrice = (price: number | null) => {
    if (price === null || price === 0) return 'Gratis';
    return formatUSD(price);
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-6xl mx-auto">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[13px] font-medium text-primary">
              Comunidad
            </span>
          </div>
          <h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold text-foreground tracking-tight">
            Áreas y tarifas
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base font-medium">
            Define tarifas, horarios y límites de tiempo de cada área común.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-2xl bg-card shadow-hairline">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
            <p className="text-xs font-medium text-muted-foreground">Cargando inventario de áreas...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {resources.map((resource) => {
              const config = resourceIcons[resource.name] || { icon: Building, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' };
              const Icon = config.icon;

              return (
                <div 
                  key={resource.id} 
                  className="p-6 sm:p-8 rounded-2xl bg-card transition-[color,background-color,border-color,box-shadow,opacity,transform] space-y-6 shadow-hairline"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-xl ${config.bg} ${config.color} border ${config.border} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="w-7 h-7" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-xl text-foreground">{resource.name}</h3>
                        <p className="text-xs sm:text-sm text-muted-foreground font-medium mt-0.5">
                          {resource.description || 'Espacio común habilitado para residentes.'}
                        </p>
                      </div>
                    </div>

                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => openEditDialog(resource)} 
                      className="h-11 px-5 rounded-xl border font-semibold text-xs gap-2 self-start sm:self-auto"
                    >
                      <Edit className="w-4 h-4" />
                      Modificar tarifas
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl bg-background border border-border/80">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Cuota base</p>
                      <p className="text-lg sm:text-xl font-semibold text-primary">
                        {formatPrice(resource.base_price)}
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-background border border-border/80">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Costo por hora</p>
                      <p className="text-lg sm:text-xl font-semibold text-primary">
                        {formatPrice(resource.price_per_hour)}
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-background border border-border/80">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Límite continuo</p>
                      <p className="text-lg sm:text-xl font-semibold text-foreground">
                        {resource.max_hours_per_booking || 4} <span className="text-xs font-medium text-muted-foreground">horas</span>
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-background border border-border/80">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Horario hábil</p>
                      <p className="text-sm sm:text-base font-semibold text-foreground mt-1">
                        {resource.available_from || '08:00'} - {resource.available_until || '22:00'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-lg rounded-2xl bg-card p-6 sm:p-8">
            <DialogHeader className="border-b border-border/70 pb-4">
              <DialogTitle className="text-2xl font-semibold text-foreground">
                Configurar {editingResource?.name}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm font-medium">
                Ajusta la cuota de mantenimiento y parámetros de reserva aplicables.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="manage-resources-descripcion-del-espacio" className="text-xs font-semibold text-foreground">Descripción del espacio</Label>
                <Textarea id="manage-resources-descripcion-del-espacio"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descripción para los residentes..."
                  rows={3}
                  className="border border-border/80 rounded-xl bg-background font-medium resize-none text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="manage-resources-precio-base-usd" className="text-xs font-semibold text-foreground">Precio base (USD)</Label>
                  <Input id="manage-resources-precio-base-usd"
                    type="number"
                    min="0"
                    step="1000"
                    value={formData.base_price}
                    onChange={(e) => setFormData({ ...formData, base_price: e.target.value })}
                    className="h-12 border border-border/80 rounded-xl bg-background font-semibold"
                  />
                  <p className="text-xs text-muted-foreground font-medium">Cobro inicial fijo</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manage-resources-precio-por-hora-usd" className="text-xs font-semibold text-foreground">Precio por hora (USD)</Label>
                  <Input id="manage-resources-precio-por-hora-usd"
                    type="number"
                    min="0"
                    step="1000"
                    value={formData.price_per_hour}
                    onChange={(e) => setFormData({ ...formData, price_per_hour: e.target.value })}
                    className="h-12 border border-border/80 rounded-xl bg-background font-semibold"
                  />
                  <p className="text-xs text-muted-foreground font-medium">Adicional por hora extra</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="manage-resources-maximo-de-horas-por-turno" className="text-xs font-semibold text-foreground">Máximo de horas por turno</Label>
                <Input id="manage-resources-maximo-de-horas-por-turno"
                  type="number"
                  min="1"
                  max="12"
                  value={formData.max_hours_per_booking}
                  onChange={(e) => setFormData({ ...formData, max_hours_per_booking: e.target.value })}
                  className="h-12 border border-border/80 rounded-xl bg-background font-semibold"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-4 border-t border-border/70">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="rounded-xl font-semibold border">
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving} className="rounded-xl font-semibold shadow-sm">
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar cambios'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default ManageResources;
