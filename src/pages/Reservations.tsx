import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AvailabilityCalendar } from '@/components/reservations/AvailabilityCalendar';
import { CalendarDays, Plus, Loader2, TreesIcon, Building, Car, X, DollarSign, Clock, User, ArrowRight, CheckCircle, Info } from 'lucide-react';
import { format, addHours, setHours, setMinutes, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface Resource {
  id: string;
  name: string;
  description: string | null;
  max_hours_per_booking: number | null;
  base_price: number | null;
  price_per_hour: number | null;
}

interface Reservation {
  id: string;
  resource_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
  price: number | null;
  rejection_reason: string | null;
  resources?: Resource;
  profiles?: {
    full_name: string | null;
    apartment_number: string | null;
  };
}

const resourceIcons: Record<string, any> = {
  'Zonas Verdes': { icon: TreesIcon, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  'Salón Social': { icon: Building, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  'Parqueadero Visitantes': { icon: Car, color: 'text-amber-500', bg: 'bg-amber-500/10' },
};

const Reservations = () => {
  const { user } = useAuth();
  const [resources, setResources] = useState<Resource[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [allReservations, setAllReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedResource, setSelectedResource] = useState('');
  const [selectedStartTime, setSelectedStartTime] = useState('');
  const [selectedDuration, setSelectedDuration] = useState('2');
  const [notes, setNotes] = useState('');

  const selectedResourceData = resources.find(r => r.id === selectedResource);
  
  const calculatePrice = () => {
    if (!selectedResourceData) return 0;
    const basePrice = selectedResourceData.base_price || 0;
    const hourlyRate = selectedResourceData.price_per_hour || 0;
    const duration = parseInt(selectedDuration) || 0;
    return basePrice + (hourlyRate * duration);
  };

  const estimatedPrice = calculatePrice();

  const fetchData = async () => {
    if (!user) return;

    const [resourcesRes, myReservationsRes, allReservationsRes] = await Promise.all([
      supabase.from('resources').select('*'),
      supabase
        .from('reservations')
        .select('*, resources(*)')
        .eq('user_id', user.id)
        .in('status', ['pending', 'confirmed'])
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true }),
      supabase
        .from('reservations')
        .select('*, resources(*)')
        .in('status', ['pending', 'confirmed'])
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true }),
    ]);

    if (resourcesRes.data) setResources(resourcesRes.data);
    if (myReservationsRes.data) setReservations(myReservationsRes.data as unknown as Reservation[]);
    
    if (allReservationsRes.data) {
      const userIds = [...new Set(allReservationsRes.data.map(r => r.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, apartment_number')
        .in('id', userIds);
      
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      const reservationsWithProfiles = allReservationsRes.data.map(r => ({
        ...r,
        profiles: profileMap.get(r.user_id) || null
      }));
      setAllReservations(reservationsWithProfiles as unknown as Reservation[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('reservations-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations'
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const checkAvailability = async (resourceId: string, startTime: Date, endTime: Date) => {
    const { data, error } = await supabase
      .from('reservations')
      .select('id')
      .eq('resource_id', resourceId)
      .eq('status', 'confirmed')
      .or(`and(start_time.lt.${endTime.toISOString()},end_time.gt.${startTime.toISOString()})`);

    return !error && (!data || data.length === 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedDate || !selectedResource || !selectedStartTime) {
      toast.error('Por favor completa todos los campos requeridos');
      return;
    }

    const startTime = setMinutes(setHours(selectedDate, parseInt(selectedStartTime)), 0);
    const endTime = addHours(startTime, parseInt(selectedDuration));

    if (isBefore(startTime, new Date())) {
      toast.error('No puedes reservar una hora en el pasado');
      return;
    }

    setIsSubmitting(true);

    const isAvailable = await checkAvailability(selectedResource, startTime, endTime);
    if (!isAvailable) {
      toast.error('Este horario ya está reservado. Por favor elige otro.');
      setIsSubmitting(false);
      return;
    }

    const { error } = await supabase.from('reservations').insert({
      resource_id: selectedResource,
      user_id: user?.id,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      status: 'pending',
      notes: notes || null,
      price: estimatedPrice,
    });

    if (error) {
      toast.error('Error al crear la reserva');
    } else {
      toast.success('Reserva enviada para aprobación');
      fetchData();
      setIsDialogOpen(false);
      resetForm();
    }

    setIsSubmitting(false);
  };

  const handleCancel = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas cancelar esta reserva?')) return;

    const { error } = await supabase
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (error) {
      toast.error('Error al cancelar reserva');
    } else {
      toast.success('Reserva cancelada');
      fetchData();
    }
  };

  const resetForm = () => {
    setSelectedDate(undefined);
    setSelectedResource('');
    setSelectedStartTime('');
    setSelectedDuration('2');
    setNotes('');
  };

  const handleSlotSelect = (date: Date, hour: number) => {
    setSelectedDate(date);
    setSelectedStartTime(hour.toString());
  };

  const formatPrice = (price: number | null) => {
    if (price === null || price === 0) return 'Gratis';
    return `$${price.toFixed(2)}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <StatusBadge status="success">Confirmada</StatusBadge>;
      case 'pending':
        return <StatusBadge status="warning">Pendiente</StatusBadge>;
      case 'rejected':
        return <StatusBadge status="destructive">Rechazada</StatusBadge>;
      case 'cancelled':
        return <StatusBadge status="muted">Cancelada</StatusBadge>;
      default:
        return <StatusBadge status="muted">{status}</StatusBadge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-10 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h1 className="font-display text-4xl font-black flex items-center gap-4 text-foreground tracking-tight">
              <div className="p-3 bg-primary/10 rounded-2xl">
                <CalendarDays className="w-8 h-8 text-primary" />
              </div>
              Reservas de Áreas Comunes
            </h1>
            <p className="text-muted-foreground mt-2 text-lg font-medium">
              Agenda los espacios exclusivos de tu conjunto residencial
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="gap-2 rounded-2xl px-8 shadow-xl shadow-primary/20 h-14 font-black">
                <Plus className="w-5 h-5" />
                NUEVA RESERVA
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl rounded-3xl border-none shadow-2xl bg-card/95 backdrop-blur-xl max-h-[90vh] overflow-y-auto scrollbar-custom">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black">Hacer una Reserva</DialogTitle>
                <DialogDescription className="font-medium">
                  Selecciona el área, la fecha y el horario de tu preferencia.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-6 pt-4">
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Selecciona el Área</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {resources.map((resource) => {
                      const config = resourceIcons[resource.name] || { icon: Building, color: 'text-slate-500', bg: 'bg-slate-500/10' };
                      const Icon = config.icon;
                      const isSelected = selectedResource === resource.id;
                      
                      return (
                        <div 
                          key={resource.id}
                          onClick={() => setSelectedResource(resource.id)}
                          className={`
                            p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-2
                            ${isSelected ? 'border-primary bg-primary/5 shadow-md scale-105' : 'border-transparent bg-muted/40 hover:bg-muted/60'}
                          `}
                        >
                          <div className={`p-3 rounded-xl ${isSelected ? 'bg-primary text-primary-foreground' : `${config.bg} ${config.color}`}`}>
                            <Icon className="w-6 h-6" />
                          </div>
                          <p className="text-xs font-black leading-tight">{resource.name}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {selectedResource && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Verificar Disponibilidad</Label>
                    <AvailabilityCalendar
                      resourceId={selectedResource}
                      resourceName={selectedResourceData?.name || ''}
                      onSelectSlot={handleSlotSelect}
                      selectedDate={selectedDate}
                      selectedHour={selectedStartTime ? parseInt(selectedStartTime) : undefined}
                    />
                    
                    <AnimatePresence>
                      {selectedDate && selectedStartTime && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-4"
                        >
                          <div className="p-3 bg-emerald-500 rounded-xl text-white">
                            <CheckCircle className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Horario Seleccionado</p>
                            <p className="text-sm font-bold text-emerald-900">
                              {format(selectedDate, 'EEEE, d MMMM', { locale: es })} a las {format(setHours(new Date(), parseInt(selectedStartTime)), 'h:00 a')}
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Duración (Horas)</Label>
                    <Select value={selectedDuration} onValueChange={setSelectedDuration}>
                      <SelectTrigger className="h-14 bg-muted/50 border-none rounded-2xl">
                        <SelectValue placeholder="Selecciona duración" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-none shadow-xl">
                        <SelectItem value="1">1 hora</SelectItem>
                        <SelectItem value="2">2 horas</SelectItem>
                        <SelectItem value="3">3 horas</SelectItem>
                        <SelectItem value="4">4 horas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Inversión Estimada</Label>
                    <div className="h-14 bg-primary/5 border border-primary/20 rounded-2xl flex items-center px-5 justify-between">
                      <DollarSign className="w-5 h-5 text-primary" />
                      <span className="text-xl font-black text-primary">{formatPrice(estimatedPrice)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Notas adicionales</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ej: Invitados externos, uso de sonido, etc."
                    rows={2}
                    className="bg-muted/50 border-none rounded-2xl focus:ring-primary/20 font-medium resize-none"
                  />
                </div>

                <div className="flex justify-end gap-4 pt-4">
                  <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-xl h-12 font-bold">
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting || !selectedDate} className="rounded-xl h-12 px-10 font-black shadow-lg shadow-primary/20">
                    {isSubmitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      'RESERVAR AHORA'
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* My Reservations */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground px-1 flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              Mi Agenda de Reservas
            </h2>
            
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
              </div>
            ) : reservations.length === 0 ? (
              <Card className="card-elevated border-none shadow-2xl p-20 text-center bg-card/30 backdrop-blur-xl">
                <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
                  <CalendarDays className="w-10 h-10 text-muted-foreground/40" />
                </div>
                <h3 className="font-black text-xl text-foreground">No tienes reservas activas</h3>
                <p className="text-muted-foreground font-medium mt-2">¿Qué tal si agendas un espacio para este fin de semana?</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {reservations.map((reservation) => {
                  const config = resourceIcons[reservation.resources?.name || ''] || { icon: Building, color: 'text-slate-500', bg: 'bg-slate-500/10' };
                  const Icon = config.icon;
                  
                  return (
                    <Card key={reservation.id} className="card-elevated border-none shadow-lg hover:shadow-xl transition-all overflow-hidden bg-card/40 backdrop-blur-xl group">
                      <div className="flex flex-col md:flex-row items-center p-6 gap-6">
                        <div className={`p-4 rounded-2xl ${config.bg} ${config.color} shadow-sm`}>
                          <Icon className="w-8 h-8" />
                        </div>
                        <div className="flex-1 text-center md:text-left">
                          <h3 className="font-black text-xl text-foreground group-hover:text-primary transition-colors leading-tight">{reservation.resources?.name}</h3>
                          <div className="flex flex-wrap items-center gap-4 mt-2 justify-center md:justify-start">
                            <div className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
                              <CalendarDays className="w-4 h-4" />
                              {format(new Date(reservation.start_time), "d 'de' MMMM", { locale: es })}
                            </div>
                            <div className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
                              <Clock className="w-4 h-4" />
                              {format(new Date(reservation.start_time), 'h:mm a')} - {format(new Date(reservation.end_time), 'h:mm a')}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col md:flex-row items-center gap-4">
                          <div className="text-right hidden md:block">
                            <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1">Costo</p>
                            <p className="text-lg font-black text-primary">{formatPrice(reservation.price)}</p>
                          </div>
                          {getStatusBadge(reservation.status)}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:bg-destructive/10 rounded-full"
                            onClick={() => handleCancel(reservation.id)}
                          >
                            <X className="w-5 h-5" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Availability Overview Sidebar */}
          <div className="space-y-6">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground px-1 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Ocupación General
            </h2>
            <Card className="card-elevated border-none shadow-2xl bg-card/30 backdrop-blur-xl overflow-hidden">
              <CardHeader className="pb-2 border-b border-border/50 bg-background/40">
                <CardTitle className="text-sm font-black uppercase tracking-widest">Actividades de hoy</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {allReservations.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-xs font-bold text-muted-foreground uppercase">Todo despejado hoy</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {allReservations.map((reservation) => (
                      <div key={reservation.id} className="p-5 hover:bg-primary/5 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-primary px-2 py-0.5 bg-primary/10 rounded-full">
                            {reservation.resources?.name}
                          </span>
                          <span className="text-[10px] font-black text-muted-foreground/60">{format(new Date(reservation.start_time), 'h:mm a')}</span>
                        </div>
                        <p className="text-sm font-bold text-foreground">
                          Ocupado por {reservation.profiles?.full_name?.split(' ')[0] || 'Residente'}
                        </p>
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-1">
                          Apto {reservation.profiles?.apartment_number || 'S/N'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
              <div className="p-4 bg-muted/20 border-t border-border/50">
                <Button variant="ghost" className="w-full text-xs font-bold gap-2 text-muted-foreground" onClick={fetchData}>
                  Actualizar disponibilidad <ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            </Card>

            <Card className="card-elevated border-none bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-6 shadow-xl shadow-blue-200">
              <h3 className="font-black text-lg mb-3 flex items-center gap-2">
                <Info className="w-5 h-5" />
                Reglamento
              </h3>
              <ul className="text-xs space-y-3 font-medium opacity-90">
                <li className="flex gap-2">• Reservas con máximo 48h de antelación.</li>
                <li className="flex gap-2">• Cancelaciones permitidas hasta 4h antes.</li>
                <li className="flex gap-2">• El costo se cargará a tu próxima alícuota.</li>
              </ul>
            </Card>
          </div>
        </div>
      </div>

      <style>{`
        .scrollbar-custom::-webkit-scrollbar {
          width: 8px;
        }
        .scrollbar-custom::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-custom::-webkit-scrollbar-thumb {
          background: hsl(var(--muted-foreground) / 0.2);
          border-radius: 10px;
        }
        .scrollbar-custom::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--primary) / 0.2);
        }
      `}</style>
    </DashboardLayout>
  );
};

export default Reservations;
