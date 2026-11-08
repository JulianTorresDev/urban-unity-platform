import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
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
import { 
  CalendarDays, 
  Plus, 
  Loader2, 
  TreesIcon, 
  Building, 
  Car, 
  X, 
  DollarSign, 
  Clock, 
  User, 
  ArrowRight, 
  CheckCircle, 
  Info, 
  ShieldCheck, 
  AlertCircle,
  HelpCircle,
  PhoneCall
} from 'lucide-react';
import { format, addHours, setHours, setMinutes, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { formatUSD } from '@/lib/format';

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

const resourceIcons: Record<string, { icon: LucideIcon; color: string; bg: string; border: string; label?: string }> = {
  'Zonas Verdes': { icon: TreesIcon, color: 'text-emerald-600', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  'Salón Social': { icon: Building, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' },
  'Parqueadero Visitantes': { icon: Car, color: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
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

    try {
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

      if (resourcesRes.data) {
        setResources(resourcesRes.data);
        if (!selectedResource && resourcesRes.data.length > 0) {
          setSelectedResource(resourcesRes.data[0].id);
        }
      }
      if (myReservationsRes.data) setReservations(myReservationsRes.data as unknown as Reservation[]);
      if (allReservationsRes.data) setAllReservations(allReservationsRes.data as unknown as Reservation[]);
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar la información');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResource || !selectedDate || !selectedStartTime) {
      toast.error('Por favor selecciona el área, el día y la hora de inicio');
      return;
    }

    setIsSubmitting(true);
    try {
      const startHour = parseInt(selectedStartTime);
      const duration = parseInt(selectedDuration);
      
      const startTime = setMinutes(setHours(selectedDate, startHour), 0);
      const endTime = addHours(startTime, duration);

      if (isBefore(startTime, new Date())) {
        toast.error('No puedes reservar en un horario anterior a la hora actual');
        setIsSubmitting(false);
        return;
      }

      // Check conflict
      const { data: conflicts } = await supabase
        .from('reservations')
        .select('id')
        .eq('resource_id', selectedResource)
        .in('status', ['pending', 'confirmed'])
        .lt('start_time', endTime.toISOString())
        .gt('end_time', startTime.toISOString());

      if (conflicts && conflicts.length > 0) {
        toast.error('Este espacio ya se encuentra reservado en ese horario');
        setIsSubmitting(false);
        return;
      }

      const { error } = await supabase.from('reservations').insert({
        user_id: user?.id,
        resource_id: selectedResource,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        notes: notes || null,
        price: estimatedPrice,
        status: 'pending'
      });

      if (error) {
        toast.error('Error al registrar reserva: ' + error.message);
      } else {
        toast.success('Reserva solicitada. La administración la confirmará pronto.');
        setIsDialogOpen(false);
        resetForm();
        fetchData();
      }
    } catch {
      toast.error('Ocurrió un error inesperado al reservar');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('¿Confirmas que deseas cancelar esta reserva?')) return;

    const { error } = await supabase
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (error) {
      toast.error('Error al cancelar la reserva');
    } else {
      toast.success('Reserva cancelada correctamente');
      fetchData();
    }
  };

  const resetForm = () => {
    setSelectedDate(undefined);
    setSelectedStartTime('');
    setSelectedDuration('2');
    setNotes('');
  };

  const formatPrice = (price: number | null) => {
    if (price === null || price === 0) return 'Gratuito';
    return formatUSD(price);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <StatusBadge status="success">Confirmada</StatusBadge>;
      case 'pending':
        return <StatusBadge status="warning">En revisión</StatusBadge>;
      case 'cancelled':
        return <StatusBadge status="destructive">Cancelada</StatusBadge>;
      case 'rejected':
        return <StatusBadge status="destructive">Rechazada</StatusBadge>;
      default:
        return <StatusBadge status="muted">{status}</StatusBadge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[13px] font-medium text-primary">
                Comunidad
              </span>
            </div>
            <h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold text-foreground tracking-tight">
              Reservas
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base font-medium">
              Reserva el salón social y otras áreas comunes, sin cruces de horario.
            </p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                size="lg" 
                className="h-12 px-6 text-[15px] flex-shrink-0"
              >
                <Plus className="w-5 h-5" />
                Nueva reserva
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-2xl rounded-2xl bg-card p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
              <DialogHeader className="border-b border-border/70 pb-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <CalendarDays className="w-4 h-4" />
                  <span>Paso 1 de 2 · Elige el área</span>
                </div>
                <DialogTitle className="text-2xl font-semibold text-foreground mt-1">
                  Solicitar reserva de espacio
                </DialogTitle>
                <DialogDescription className="text-muted-foreground text-sm font-medium">
                  Elige el área común, la fecha deseada en el calendario y el horario disponible.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-6 pt-4">
                {/* Step 1: Resource Selector */}
                <div className="space-y-2">
                  <Label htmlFor="reservations-1-selecciona-el-area-comun" className="text-xs font-semibold text-foreground">
                    1. Selecciona el Área Común
                  </Label>
                  <Select value={selectedResource} onValueChange={(val) => {
                    setSelectedResource(val);
                    setSelectedDate(undefined);
                    setSelectedStartTime('');
                  }}>
                    <SelectTrigger id="reservations-1-selecciona-el-area-comun" className="h-12">
                      <SelectValue placeholder="Elige un área común..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border border-border bg-card shadow-lg">
                      {resources.map((r) => (
                        <SelectItem key={r.id} value={r.id} className="py-3 font-semibold cursor-pointer">
                          <div className="flex items-center justify-between w-full gap-4">
                            <span>{r.name}</span>
                            <span className="text-xs text-muted-foreground font-medium">
                              {r.base_price ? formatPrice(r.base_price) : 'Sin costo base'}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Step 2: Calendar & Slot picker */}
                {selectedResource && (
                  <div className="space-y-3">
                    <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span>2. Elige fecha y hora de inicio</span>
                      {selectedResourceData && (
                        <span className="text-muted-foreground font-semibold">
                          Máximo {selectedResourceData.max_hours_per_booking || 4} horas seguidas
                        </span>
                      )}
                    </Label>

                    <AvailabilityCalendar
                      resourceId={selectedResource}
                      resourceName={selectedResourceData?.name || ''}
                      selectedDate={selectedDate}
                      selectedHour={selectedStartTime ? parseInt(selectedStartTime) : undefined}
                      onSelectSlot={(date, hour) => {
                        setSelectedDate(date);
                        setSelectedStartTime(hour.toString());
                      }}
                    />

                    {selectedDate && selectedStartTime && (
                      <motion.div 
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/40 flex items-center gap-3"
                      >
                        <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center text-white flex-shrink-0">
                          <CheckCircle className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            Horario seleccionado
                          </p>
                          <p className="text-sm font-semibold text-foreground">
                            {format(selectedDate, "EEEE d 'de' MMMM, yyyy", { locale: es })} a las {format(setHours(new Date(), parseInt(selectedStartTime)), 'h:00 a')}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}

                {/* Step 3: Duration & Price Calculation */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="reservations-3-duracion-del-evento" className="text-xs font-semibold text-foreground">
                      3. Duración del Evento
                    </Label>
                    <Select value={selectedDuration} onValueChange={setSelectedDuration}>
                      <SelectTrigger id="reservations-3-duracion-del-evento" className="h-12">
                        <SelectValue placeholder="Duración" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border border-border bg-card">
                        <SelectItem value="1">1 hora</SelectItem>
                        <SelectItem value="2">2 horas</SelectItem>
                        <SelectItem value="3">3 horas</SelectItem>
                        <SelectItem value="4">4 horas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-foreground">
                      Costo estimado
                    </Label>
                    <div className="h-14 px-4 rounded-xl border border-primary/30 bg-primary/5 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                        <DollarSign className="w-4 h-4" />
                        Total
                      </div>
                      <span className="text-lg font-semibold text-foreground">{formatPrice(estimatedPrice)}</span>
                    </div>
                  </div>
                </div>

                {/* Step 4: Notes */}
                <div className="space-y-2">
                  <Label htmlFor="reservations-detalles-o-motivo-de-la-reserva-" className="text-xs font-semibold text-foreground">
                    Detalles o motivo de la reserva (Opcional)
                  </Label>
                  <Textarea id="reservations-detalles-o-motivo-de-la-reserva-"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ej: Cumpleaños familiar, número estimado de invitados, uso de equipo de sonido..."
                    rows={2}
                    className="border border-border/80 rounded-xl bg-background font-medium resize-none min-h-[70px]"
                  />
                </div>

                {/* Dialog Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-border/70">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsDialogOpen(false)} 
                    className="w-full sm:w-auto h-12 rounded-xl font-semibold border"
                  >
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={isSubmitting || !selectedDate || !selectedStartTime} 
                    className="w-full sm:w-auto h-12 px-8 rounded-xl font-semibold shadow-sm gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      'Enviar solicitud'
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Catalog of Amenities Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {resources.map((res) => {
            const config = resourceIcons[res.name] || { icon: Building, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' };
            const Icon = config.icon;
            return (
              <div 
                key={res.id}
                className="p-5 rounded-2xl bg-card transition-[color,background-color,border-color,box-shadow,opacity,transform] flex items-start gap-4 shadow-hairline"
              >
                <div className={`w-12 h-12 rounded-xl ${config.bg} ${config.color} border ${config.border} flex items-center justify-center flex-shrink-0`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-base text-foreground truncate">{res.name}</h3>
                    <span className="text-xs font-semibold text-primary px-2 py-0.5 rounded-md bg-primary/10">
                      {res.base_price ? formatPrice(res.base_price) : 'Gratuito'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 font-medium">
                    {res.description || 'Espacio común acondicionado para el disfrute de la comunidad.'}
                  </p>
                  <div className="mt-3 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-primary" />
                    <span>Máximo {res.max_hours_per_booking || 4} horas de uso continuo</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Main Content Layout: Reservations Agenda + Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* User's Active Reservations */}
          <div className="lg:col-span-2 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary" />
                Mis reservas
              </h2>
              <span className="text-xs font-medium text-muted-foreground">
                {reservations.length} {reservations.length === 1 ? 'reserva activa' : 'reservas activas'}
              </span>
            </div>
            
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 rounded-2xl bg-card shadow-hairline">
                <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
                <p className="text-xs font-medium text-muted-foreground">Cargando reservas...</p>
              </div>
            ) : reservations.length === 0 ? (
              <div className="border border-dashed border-border/80 rounded-2xl p-12 text-center bg-card">
                <div className="w-16 h-16 bg-muted rounded-2xl border border-border/70 flex items-center justify-center mx-auto mb-4">
                  <CalendarDays className="w-8 h-8 text-muted-foreground/60" />
                </div>
                <h3 className="font-semibold text-lg text-foreground">No tienes reservas activas</h3>
                <p className="text-muted-foreground text-sm font-medium mt-1 max-w-md mx-auto">
                  Para apartar un área común, pulsa "Nueva reserva".
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {reservations.map((reservation) => {
                  const config = resourceIcons[reservation.resources?.name || ''] || { icon: Building, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' };
                  const Icon = config.icon;
                  
                  return (
                    <div 
                      key={reservation.id} 
                      className="p-5 sm:p-6 rounded-2xl bg-card transition-[color,background-color,border-color,box-shadow,opacity,transform] flex flex-col md:flex-row items-start md:items-center justify-between gap-5 shadow-hairline"
                    >
                      <div className="flex items-start gap-4">
                        <div className={`w-14 h-14 rounded-xl ${config.bg} ${config.color} border ${config.border} flex items-center justify-center flex-shrink-0`}>
                          <Icon className="w-7 h-7" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold text-lg text-foreground">{reservation.resources?.name}</h3>
                            {getStatusBadge(reservation.status)}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <CalendarDays className="w-3.5 h-3.5 text-primary" />
                              <span className="capitalize">{format(new Date(reservation.start_time), "EEEE d 'de' MMMM", { locale: es })}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-primary" />
                              <span>{format(new Date(reservation.start_time), 'h:mm a')} – {format(new Date(reservation.end_time), 'h:mm a')}</span>
                            </div>
                          </div>
                          {reservation.notes && (
                            <p className="text-xs text-muted-foreground font-medium italic mt-1">
                              "{reservation.notes}"
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between w-full md:w-auto md:justify-end gap-5 pt-3 md:pt-0 border-t md:border-t-0 border-border/70">
                        <div className="text-left md:text-right">
                          <p className="text-xs font-medium text-muted-foreground">Costo</p>
                          <p className="text-base font-semibold text-foreground">{formatPrice(reservation.price)}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-10 px-4 rounded-xl border border-rose-300 dark:border-rose-900/50 text-rose-600 hover:bg-rose-500/10 font-semibold text-xs gap-1.5"
                          onClick={() => handleCancel(reservation.id)}
                          title="Cancelar reserva"
                        >
                          <X className="w-4 h-4" />
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Sidebar: Rules & Today's Schedule */}
          <div className="space-y-6">
            {/* Architectural Reglamento Card (Clean, elegant, sober - replaces provisional blue gradient card) */}
            <div className="rounded-2xl bg-card overflow-hidden shadow-hairline">
              <div className="p-4 bg-muted/40 border-b border-border/70 flex items-center gap-2.5">
                <div className="flex items-center justify-center text-muted-foreground">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-foreground">Reglamento de convivencia</h3>
                  <p className="text-xs text-muted-foreground font-medium">Normas vigentes de uso de áreas comunes</p>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div className="space-y-3 text-[13px] text-muted-foreground">
                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-md bg-muted text-foreground/80 flex items-center justify-center font-medium text-xs flex-shrink-0 mt-0.5">
                      1
                    </span>
                    <p className="leading-relaxed">
                      <strong className="text-foreground">Antelación:</strong> Solicita tu espacio con un mínimo de 24 horas y un máximo de 30 días de anticipación.
                    </p>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-md bg-muted text-foreground/80 flex items-center justify-center font-medium text-xs flex-shrink-0 mt-0.5">
                      2
                    </span>
                    <p className="leading-relaxed">
                      <strong className="text-foreground">Cancelaciones:</strong> Deben realizarse al menos 4 horas antes de la hora pactada para liberar el turno a otros vecinos.
                    </p>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-md bg-muted text-foreground/80 flex items-center justify-center font-medium text-xs flex-shrink-0 mt-0.5">
                      3
                    </span>
                    <p className="leading-relaxed">
                      <strong className="text-foreground">Cobro:</strong> Las tarifas por uso de espacios se consolidarán en tu próximo estado de cuenta mensual.
                    </p>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-md bg-muted text-foreground/80 flex items-center justify-center font-medium text-xs flex-shrink-0 mt-0.5">
                      4
                    </span>
                    <p className="leading-relaxed">
                      <strong className="text-foreground">Entrega y cuidado:</strong> El espacio debe entregarse limpio y sin ruidos molestos pasadas las 10:00 PM.
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-border/60 flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <PhoneCall className="w-3.5 h-3.5 text-primary" />
                    Garita:
                  </span>
                  <span className="text-foreground font-semibold">Ext. 101</span>
                </div>
              </div>
            </div>

            {/* General Occupancy Today Card */}
            <div className="rounded-2xl bg-card overflow-hidden shadow-hairline">
              <div className="p-4 bg-muted/30 border-b border-border/70 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-xs text-foreground">Turnos reservados hoy</h3>
                </div>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  onClick={fetchData}
                  className="h-7 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Actualizar
                </Button>
              </div>

              <div className="p-4">
                {allReservations.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    <CheckCircle className="w-6 h-6 mx-auto mb-2 text-emerald-500 opacity-80" />
                    <p className="text-xs font-semibold text-foreground">Todo despejado hoy</p>
                    <p className="text-xs mt-0.5 font-medium">Las áreas comunes están libres para solicitud.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {allReservations.slice(0, 5).map((r) => (
                      <div key={r.id} className="p-3 rounded-xl border border-border/80 bg-background flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-foreground">{r.resources?.name}</p>
                          <p className="text-xs font-medium text-muted-foreground">
                            {format(new Date(r.start_time), 'h:mm a')} – {format(new Date(r.end_time), 'h:mm a')}
                          </p>
                        </div>
                        <span className="text-xs font-semibold uppercase px-2.5 py-1 rounded-md bg-muted text-foreground border border-border">
                          Apto {r.profiles?.apartment_number || 'S/N'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Reservations;
