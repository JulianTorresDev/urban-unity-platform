import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { User, Phone, Building, Mail, Save, Loader2 } from 'lucide-react';

const profileSchema = z.object({
  full_name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
  phone: z.string().optional(),
  apartment_number: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const Profile = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: '',
      phone: '',
      apartment_number: '',
    },
  });

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error) throw error;

        if (data) {
          form.reset({
            full_name: data.full_name || '',
            phone: data.phone || '',
            apartment_number: data.apartment_number || '',
          });
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
        toast.error('Error al cargar datos del perfil');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  const onSubmit = async (values: ProfileFormValues) => {
    if (!user) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: values.full_name,
          phone: values.phone || null,
          apartment_number: values.apartment_number || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('Perfil actualizado con éxito');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Error al actualizar perfil');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-5xl mx-auto">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Mi Perfil</h1>
          <p className="text-muted-foreground mt-1">Gestiona tu información personal y de contacto</p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <Card className="card-elevated border-none shadow-xl">
            <CardHeader className="bg-primary/5 rounded-t-xl border-b border-primary/10">
              <CardTitle className="flex items-center gap-3 text-lg">
                <User className="w-5 h-5 text-primary" />
                Información Personal
              </CardTitle>
              <CardDescription>
                Actualiza tus datos básicos y número de contacto
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="full_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">Nombre Completo</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input placeholder="Juan Pérez" className="pl-10 h-12 bg-muted/30 border-none" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">Número de Teléfono</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input placeholder="+57 300 123 4567" className="pl-10 h-12 bg-muted/30 border-none" {...field} />
                          </div>
                        </FormControl>
                        <FormDescription>
                          Utilizado para notificaciones importantes
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="apartment_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">Número de Apartamento / Casa</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input placeholder="Torre A - 101" className="pl-10 h-12 bg-muted/30 border-none" {...field} />
                          </div>
                        </FormControl>
                        <FormDescription>
                          Tu unidad residencial asignada
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" disabled={saving} className="w-full h-12 rounded-full font-bold shadow-lg hover:shadow-primary/20 transition-all">
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Guardar Cambios
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card className="card-elevated border-none shadow-xl bg-card/50">
            <CardHeader className="bg-muted/30 rounded-t-xl border-b">
              <CardTitle className="flex items-center gap-3 text-lg">
                <Mail className="w-5 h-5 text-primary" />
                Datos de Cuenta
              </CardTitle>
              <CardDescription>
                Detalles de tu cuenta (solo lectura)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Correo Electrónico</label>
                <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-2xl border border-dashed">
                  <Mail className="w-5 h-5 text-muted-foreground" />
                  <span className="text-foreground font-medium">{user?.email}</span>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  Contacta a soporte para cambiar tu correo electrónico.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Miembro Desde</label>
                <div className="p-4 bg-muted/50 rounded-2xl border border-dashed font-medium text-foreground">
                  {user?.created_at ? new Date(user.created_at).toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  }) : 'N/A'}
                </div>
              </div>

              <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10 mt-8">
                <h4 className="font-bold text-primary mb-2 flex items-center gap-2">
                  <Building className="w-4 h-4" />
                  Privacidad de Datos
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Tus datos personales están protegidos y solo se utilizan para la gestión operativa del conjunto residencial.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Profile;
