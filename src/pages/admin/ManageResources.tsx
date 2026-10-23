import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Settings, Loader2, TreesIcon, Building, Car, DollarSign, Edit } from 'lucide-react';
import { toast } from 'sonner';

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

const resourceIcons: Record<string, React.ReactNode> = {
  'Zonas Verdes': <TreesIcon className="w-5 h-5" />,
  'Salón Social': <Building className="w-5 h-5" />,
  'Parqueadero Visitantes': <Car className="w-5 h-5" />,
};

const ManageResources = () => {
  const { isAdmin } = useAuth();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    description: '',
    base_price: '0',
    price_per_hour: '0',
    max_hours_per_booking: '4',
  });

  const fetchResources = async () => {
    const { data } = await supabase.from('resources').select('*');
    if (data) setResources(data);
    setLoading(false);
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
    
    setIsSaving(true);
    const { error } = await supabase
      .from('resources')
      .update({
        description: formData.description,
        base_price: parseFloat(formData.base_price) || 0,
        price_per_hour: parseFloat(formData.price_per_hour) || 0,
        max_hours_per_booking: parseInt(formData.max_hours_per_booking) || 4,
      })
      .eq('id', editingResource.id);

    if (error) {
      toast.error('Error al actualizar el recurso');
    } else {
      toast.success('Recurso actualizado con éxito');
      fetchResources();
      setIsDialogOpen(false);
    }
    setIsSaving(false);
  };

  const formatPrice = (price: number | null) => {
    if (price === null || price === 0) return 'Gratis';
    return `$${price.toFixed(2)}`;
  };

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Card className="card-elevated p-8 text-center border-none shadow-2xl">
            <Settings className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h2 className="font-display text-2xl font-bold">Acceso Denegado</h2>
            <p className="text-muted-foreground mt-2">
              No tienes permisos para acceder a esta página.
            </p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-3 text-foreground tracking-tight">
            <Settings className="w-8 h-8 text-primary" />
            Gestión de Áreas y Precios
          </h1>
          <p className="text-muted-foreground mt-1 font-medium">
            Configura las descripciones, precios y límites de reserva de las áreas comunes
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-6">
            {resources.map((resource) => (
              <Card key={resource.id} className="card-elevated border-none shadow-xl hover:shadow-2xl transition-all group overflow-hidden">
                <CardHeader className="bg-muted/30">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-4 rounded-2xl bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                        {resourceIcons[resource.name] || <Building className="w-6 h-6" />}
                      </div>
                      <div>
                        <CardTitle className="text-xl font-bold">{resource.name}</CardTitle>
                        <CardDescription className="font-medium text-muted-foreground">{resource.description || 'Sin descripción'}</CardDescription>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(resource)} className="rounded-full font-bold border-primary/20 hover:bg-primary/10 text-primary">
                      <Edit className="w-4 h-4 mr-2" />
                      Editar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="p-4 rounded-2xl bg-muted/50 border border-border/50">
                      <p className="text-xs font-black text-muted-foreground mb-2 uppercase tracking-wider">Precio Base</p>
                      <p className="text-2xl font-black flex items-center gap-1 text-primary">
                        <DollarSign className="w-5 h-5" />
                        {formatPrice(resource.base_price)}
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-muted/50 border border-border/50">
                      <p className="text-xs font-black text-muted-foreground mb-2 uppercase tracking-wider">Por Hora</p>
                      <p className="text-2xl font-black flex items-center gap-1 text-primary">
                        <DollarSign className="w-5 h-5" />
                        {formatPrice(resource.price_per_hour)}
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-muted/50 border border-border/50">
                      <p className="text-xs font-black text-muted-foreground mb-2 uppercase tracking-wider">Máx. Horas</p>
                      <p className="text-2xl font-black text-foreground">{resource.max_hours_per_booking || 4} <span className="text-sm font-medium text-muted-foreground">hrs</span></p>
                    </div>
                    <div className="p-4 rounded-2xl bg-muted/50 border border-border/50">
                      <p className="text-xs font-black text-muted-foreground mb-2 uppercase tracking-wider">Horario</p>
                      <p className="text-lg font-bold text-foreground">{resource.available_from || '08:00'} - {resource.available_until || '22:00'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-lg rounded-2xl">
            <DialogHeader>
              <DialogTitle>Editar {editingResource?.name}</DialogTitle>
              <DialogDescription>
                Actualiza los precios y la configuración de este recurso
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Descripción</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descripción del área..."
                  rows={3}
                  className="bg-muted/30 border-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Precio Base ($)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.base_price}
                    onChange={(e) => setFormData({ ...formData, base_price: e.target.value })}
                    className="h-12 bg-muted/30 border-none"
                  />
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Cargo fijo por reserva</p>
                </div>
                <div className="space-y-2">
                  <Label>Precio Por Hora ($)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.price_per_hour}
                    onChange={(e) => setFormData({ ...formData, price_per_hour: e.target.value })}
                    className="h-12 bg-muted/30 border-none"
                  />
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Costo adicional por hora</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Horas Máximas por Reserva</Label>
                <Input
                  type="number"
                  min="1"
                  max="24"
                  value={formData.max_hours_per_booking}
                  onChange={(e) => setFormData({ ...formData, max_hours_per_booking: e.target.value })}
                  className="h-12 bg-muted/30 border-none"
                />
              </div>
            </div>
            <DialogFooter className="gap-3">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="rounded-full">
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving} className="rounded-full px-8 shadow-lg">
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar Cambios'
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
