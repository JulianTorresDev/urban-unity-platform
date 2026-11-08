import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { User, Phone, Building, Mail, Save, Loader2, ShieldCheck, Calendar, Lock } from 'lucide-react';

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
          full_name: values.full_name.trim(),
          phone: values.phone?.trim() || null,
          // La unidad la asigna la administración; la base de datos rechaza cambiarla desde aquí
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('Perfil actualizado correctamente');
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
        <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-xs font-semibold">Cargando expediente del residente...</span>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-5xl mx-auto">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[13px] font-medium text-primary">
              Cuenta
            </span>
          </div>
          <h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold text-foreground tracking-tight">
            Mi perfil
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base font-medium">
            Mantén tus datos de contacto al día para recibir avisos de la administración y la garita.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Form Card */}
          <div className="rounded-2xl bg-card overflow-hidden shadow-hairline">
            <div className="p-5 bg-muted/40 border-b border-border/70 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-foreground/80 font-medium">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground">Información personal</h3>
                <p className="text-xs text-muted-foreground font-medium">Tus datos visibles para la administración</p>
              </div>
            </div>

            <div className="p-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <FormField
                    control={form.control}
                    name="full_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold text-foreground">
                          Nombre completo *
                        </FormLabel>
                        <div className="relative">
                            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <FormControl>
                            <Input 
                              placeholder="Ej: Carlos Alberto Gómez" 
                              className="pl-11 h-14 border border-border/80 rounded-xl bg-background font-semibold text-foreground text-sm sm:text-base" 
                              {...field} 
                            />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold text-foreground">
                          Teléfono de contacto
                        </FormLabel>
                        <div className="relative">
                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <FormControl>
                            <Input 
                              placeholder="+593 99 123 4567" 
                              className="pl-11 h-14 border border-border/80 rounded-xl bg-background font-semibold text-foreground text-sm sm:text-base" 
                              {...field} 
                            />
                          </FormControl>
                        </div>
                        <FormDescription className="text-xs text-muted-foreground font-medium">
                          Usado por portería para anunciarte visitas o paquetes
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
                        <FormLabel className="text-xs font-semibold text-foreground">
                          Departamento
                        </FormLabel>
                        <div className="relative">
                            <Building className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <FormControl>
                            <Input
                              placeholder="Sin asignar"
                              readOnly
                              aria-readonly="true"
                              className="pl-11 h-12 bg-muted/60 text-muted-foreground cursor-not-allowed"
                              {...field}
                            />
                          </FormControl>
                        </div>
                        <FormDescription className="text-xs text-muted-foreground font-medium">
                          La asigna la administración. Si es incorrecta, abre una solicitud.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    disabled={saving} 
                    className="w-full h-12 text-[15px]"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Guardando cambios...
                      </>
                    ) : (
                      <>
                        <Save className="w-5 h-5" />
                        GUARDAR ACTUALIZACIÓN
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </div>
          </div>

          {/* Account Readonly Details */}
          <div className="space-y-6">
            <div className="rounded-2xl bg-card overflow-hidden shadow-hairline">
              <div className="p-5 bg-muted/40 border-b border-border/70 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-foreground/80 font-medium">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-foreground">Seguridad y credenciales</h3>
                  <p className="text-xs text-muted-foreground font-medium">Datos de acceso a la plataforma</p>
                </div>
              </div>

              <div className="p-6 space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Correo electrónico principal
                  </label>
                  <div className="flex items-center gap-3 p-4 bg-muted/20 rounded-xl border border-border/80">
                    <Mail className="w-5 h-5 text-primary flex-shrink-0" />
                    <span className="text-foreground font-semibold text-sm truncate">{user?.email}</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium mt-1">
                    Para modificar tu correo de ingreso, solicita asistencia en administración.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Fecha de registro
                  </label>
                  <div className="flex items-center gap-3 p-4 bg-muted/20 rounded-xl border border-border/80">
                    <Calendar className="w-5 h-5 text-primary flex-shrink-0" />
                    <span className="text-foreground font-semibold text-sm">
                      {user?.created_at ? new Date(user.created_at).toLocaleDateString('es-ES', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      }) : 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-1.5">
                  <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Protección de datos personales</span>
                  </div>
                  <p className="text-xs text-foreground/80 font-medium leading-relaxed">
                    Tus datos se tratan conforme a la Ley Orgánica de Protección de Datos Personales del Ecuador y solo se usan para la administración del conjunto.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Profile;
