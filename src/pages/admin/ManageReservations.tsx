import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  CalendarDays, 
  Loader2, 
  TreesIcon, 
  Building, 
  Car, 
  Check, 
  X, 
  Calendar as CalendarIcon, 
  DollarSign, 
  Clock, 
  User, 
  ShieldCheck, 
  AlertCircle,
  Building2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { formatUSD } from '@/lib/format';

interface Resource {
  id: string;
  name: string;
  description: string | null;
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
    email: string | null;
  };
}

const resourceIcons: Record<string, { icon: LucideIcon; color: string; bg: string; border: string; label?: string }> = {
  'Zonas Verdes': { icon: TreesIcon, color: 'text-success', bg: 'bg-success/10', border: 'border-success/30' },
  'Salón Social': { icon: Building, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' },
  'Parqueadero Visitantes': { icon: Car, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30' },
};

const ManageReservations = () => {
  const { isAdmin } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [activeView, setActiveView] = useState<'list' | 'calendar'>('list');
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const fetchReservations = async () => {
    try {
      const { data: reservationsData } = await supabase
        .from('reservations')
        .select('*, resources(*)')
        .order('start_time', { ascending: true });

      if (reservationsData) {
        const userIds = [...new Set(reservationsData.map(r => r.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, apartment_number, email')
          .in('id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        const reservationsWithProfiles = reservationsData.map(r => ({
          ...r,
          profiles: profileMap.get(r.user_id) || null
        }));
        setReservations(reservationsWithProfiles as Reservation[]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReservations();

    const channel = supabase
      .channel('admin-reservations-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations'
        },
        () => {
          fetchReservations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleApprove = async (reservation: Reservation) => {
    setProcessingId(reservation.id);
    const { error } = await supabase
      .from('reservations')
      .update({ status: 'confirmed' })
      .eq('id', reservation.id);

    if (error) {
      toast.error('Error al autorizar reserva: ' + error.message);
    } else {
      toast.success('Reserva aprobada exitosamente');
      await notifyReservation(reservation, 'confirmed');
      fetchReservations();
    }
    setProcessingId(null);
  };

  // El residente se entera por la campana de notificaciones
  const notifyReservation = async (reservation: Reservation, outcome: 'confirmed' | 'rejected', reason = '') => {
    const area = reservation.resources?.name || 'el área común';
    const when = format(new Date(reservation.start_time), "d 'de' MMMM, HH:mm", { locale: es });
    const { error } = await supabase.from('notifications').insert({
      user_id: reservation.user_id,
      title: outcome === 'confirmed' ? 'Reserva confirmada' : 'Reserva rechazada',
      message: outcome === 'confirmed'
        ? `Tu reserva de ${area} para el ${when} fue confirmada.`
        : `Tu reserva de ${area} para el ${when} fue rechazada.${reason ? ' Motivo: ' + reason : ''}`,
      type: outcome === 'confirmed' ? 'success' : 'warning',
      link: '/reservations',
    });
    if (error) console.warn('No se pudo notificar al residente:', error.message);
  };

  const openRejectDialog = (reservation: Reservation) => {
    setSelectedReservation(reservation);
    setRejectionReason('');
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!selectedReservation) return;

    setProcessingId(selectedReservation.id);
    const { error } = await supabase
      .from('reservations')
      .update({
        // Antes se guardaba como 'cancelled' y no se distinguía de una cancelación del residente
        status: 'rejected',
        rejection_reason: rejectionReason.trim() || null
      })
      .eq('id', selectedReservation.id);

    if (error) {
      toast.error('Error al rechazar reserva: ' + error.message);
    } else {
      toast.success('Reserva rechazada');
      await notifyReservation(selectedReservation, 'rejected', rejectionReason.trim());
      fetchReservations();
    }
    setProcessingId(null);
    setSelectedReservation(null);
    setRejectDialogOpen(false);
  };

  const pendingReservations = reservations.filter(r => r.status === 'pending');
  const confirmedReservations = reservations.filter(r => r.status === 'confirmed');
  const cancelledReservations = reservations.filter(r => r.status === 'cancelled' || r.status === 'rejected');

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  const getReservationsForDay = (day: Date) => {
    return reservations.filter(r => 
      r.status !== 'cancelled' && r.status !== 'rejected' && isSameDay(new Date(r.start_time), day)
    );
  };

  const formatPrice = (price: number | null) => {
    if (!price || price === 0) return 'Gratis';
    return formatUSD(price);
  };

  const renderReservationCard = (reservation: Reservation, showActions: boolean = false) => {
    const config = resourceIcons[reservation.resources?.name || ''] || { icon: Building, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' };
    const Icon = config.icon;

    return (
      <div
        key={reservation.id}
        className="p-5 rounded-2xl bg-card transition-[color,background-color,border-color,box-shadow,opacity,transform] flex flex-col md:flex-row items-start md:items-center justify-between gap-5 shadow-hairline"
      >
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl ${config.bg} ${config.color} border ${config.border} flex items-center justify-center flex-shrink-0`}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h4 className="font-semibold text-base text-foreground">{reservation.resources?.name}</h4>
              <span className="text-xs font-semibold text-primary px-2.5 py-0.5 rounded-md bg-primary/10">
                {formatPrice(reservation.price)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
              <span className="capitalize">{format(new Date(reservation.start_time), "EEEE d 'de' MMMM", { locale: es })}</span>
              <span>{format(new Date(reservation.start_time), 'h:mm a')} – {format(new Date(reservation.end_time), 'h:mm a')}</span>
            </div>
            <div className="text-xs font-semibold text-foreground pt-1">
              <span>Solicitado por: <strong>{reservation.profiles?.full_name || 'Residente'}</strong></span>
              <span className="text-muted-foreground ml-2">(Apto {reservation.profiles?.apartment_number || 'S/N'})</span>
            </div>
            {reservation.notes && (
              <p className="text-xs text-muted-foreground italic mt-0.5">"{reservation.notes}"</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between w-full md:w-auto md:justify-end gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-border/70">
          {showActions ? (
            <>
              <Button
                size="sm"
                className="h-10 px-4 rounded-xl font-semibold text-xs gap-1.5 shadow-sm"
                onClick={() => handleApprove(reservation)}
                disabled={processingId === reservation.id}
              >
                {processingId === reservation.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Autorizar
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-10 px-4 rounded-xl border border-destructive/40 text-destructive hover:bg-destructive/10 font-semibold text-xs gap-1.5"
                onClick={() => openRejectDialog(reservation)}
                disabled={processingId === reservation.id}
              >
                <X className="w-4 h-4" />
                Rechazar
              </Button>
            </>
          ) : (
            <StatusBadge 
              status={
                reservation.status === 'confirmed' ? 'success' :
                reservation.status === 'pending' ? 'warning' : 'destructive'
              }
            >
              {reservation.status === 'confirmed' ? 'Autorizada' :
               reservation.status === 'rejected' ? 'Rechazada' :
               reservation.status === 'cancelled' ? 'Cancelada' : 'Pendiente'}
            </StatusBadge>
          )}
        </div>
      </div>
    );
  };

  const renderCalendarView = () => (
    <div className="rounded-2xl bg-card overflow-hidden shadow-hairline">
      <div className="p-5 bg-muted/40 border-b border-border/70 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-base text-foreground">Ocupación del mes</h3>
          <p className="text-xs text-muted-foreground font-medium">Visualización general de espacios reservados</p>
        </div>
        <div className="flex items-center gap-2 bg-background border border-border/80 rounded-xl p-1 shadow-2xs">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 px-2 font-semibold text-xs"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Anterior
          </Button>
          <span className="font-semibold min-w-[140px] text-center text-xs text-foreground capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: es })}
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 px-2 font-semibold text-xs"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            Siguiente
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
          {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
            <div key={day} className="p-2 text-center font-medium text-muted-foreground text-xs">
              {day}
            </div>
          ))}
          {Array.from({ length: monthStart.getDay() }).map((_, i) => (
            <div key={`empty-start-${i}`} className="p-2 min-h-[90px] bg-muted/10 rounded-xl border border-transparent" />
          ))}
          {daysInMonth.map(day => {
            const dayReservations = getReservationsForDay(day);
            const isToday = isSameDay(day, new Date());
            
            return (
              <div
                key={day.toISOString()}
                className={`p-2 min-h-[90px] border rounded-xl flex flex-col justify-between ${
                  isToday 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border/60 bg-background'
                } ${!isSameMonth(day, currentMonth) ? 'opacity-40' : ''}`}
              >
                <span className={`text-xs font-semibold ${isToday ? 'text-primary' : 'text-foreground'}`}>
                  {format(day, 'd')}
                </span>
                
                <div className="space-y-1 mt-1">
                  {dayReservations.slice(0, 2).map(r => (
                    <div 
                      key={r.id} 
                      className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 truncate"
                      title={`${r.resources?.name} - ${r.profiles?.full_name || 'Residente'}`}
                    >
                      {r.resources?.name} ({format(new Date(r.start_time), 'h a')})
                    </div>
                  ))}
                  {dayReservations.length > 2 && (
                    <span className="text-xs font-medium text-muted-foreground block text-center">
                      +{dayReservations.length - 2} más
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        {/* Header */}
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
              Revisa, aprueba o rechaza las solicitudes de los residentes.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-muted/40 p-1.5 rounded-xl border border-border/80">
            <Button 
              variant={activeView === 'list' ? 'default' : 'ghost'} 
              size="sm"
              className="h-10 px-4 rounded-lg font-semibold text-xs gap-2"
              onClick={() => setActiveView('list')}
            >
              <CalendarDays className="w-4 h-4" />
              Lista
            </Button>
            <Button 
              variant={activeView === 'calendar' ? 'default' : 'ghost'} 
              size="sm"
              className="h-10 px-4 rounded-lg font-semibold text-xs gap-2"
              onClick={() => setActiveView('calendar')}
            >
              <CalendarIcon className="w-4 h-4" />
              Calendario
            </Button>
          </div>
        </div>

        {activeView === 'calendar' ? (
          renderCalendarView()
        ) : (
          <Tabs defaultValue="pending" className="w-full space-y-6">
            <TabsList className="grid w-full grid-cols-3 max-w-md h-12 p-1 bg-muted/60 rounded-xl border border-border/80">
              <TabsTrigger value="pending" className="font-semibold text-xs rounded-lg gap-2">
                Por aprobar
                {pendingReservations.length > 0 && (
                  <span className="bg-primary text-primary-foreground text-xs font-semibold px-2 py-0.2 rounded-full">
                    {pendingReservations.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="confirmed" className="font-semibold text-xs rounded-lg">
                Autorizadas ({confirmedReservations.length})
              </TabsTrigger>
              <TabsTrigger value="cancelled" className="font-semibold text-xs rounded-lg">
                Canceladas o rechazadas ({cancelledReservations.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="space-y-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 rounded-2xl bg-card shadow-hairline">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
                  <span className="text-xs font-medium text-muted-foreground">Cargando solicitudes...</span>
                </div>
              ) : pendingReservations.length === 0 ? (
                <div className="border border-dashed border-border/80 rounded-2xl p-12 text-center bg-card">
                  <Check className="w-12 h-12 text-success mx-auto mb-3" />
                  <h3 className="font-semibold text-base text-foreground">No hay reservas pendientes</h3>
                  <p className="text-xs text-muted-foreground mt-1">Todas las solicitudes han sido gestionadas al día.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingReservations.map(r => renderReservationCard(r, true))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="confirmed" className="space-y-4">
              {confirmedReservations.length === 0 ? (
                <div className="border border-dashed border-border/80 rounded-2xl p-12 text-center bg-card">
                  <p className="text-xs font-medium text-muted-foreground">No hay reservas confirmadas registradas.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {confirmedReservations.map(r => renderReservationCard(r, false))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="cancelled" className="space-y-4">
              {cancelledReservations.length === 0 ? (
                <div className="border border-dashed border-border/80 rounded-2xl p-12 text-center bg-card">
                  <p className="text-xs font-medium text-muted-foreground">No hay reservas canceladas o rechazadas.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {cancelledReservations.map(r => renderReservationCard(r, false))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}

        {/* Rejection Modal */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl bg-card p-6">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-foreground">Rechazar solicitud de reserva</DialogTitle>
              <DialogDescription className="text-sm font-medium text-muted-foreground">
                Indica la razón por la cual no es posible autorizar esta solicitud. El residente la verá en su panel.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-3">
              <Label htmlFor="manage-reservations-motivo-del-rechazo" className="text-xs font-semibold text-foreground">Motivo del rechazo</Label>
              <Textarea id="manage-reservations-motivo-del-rechazo"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Ej: Mantenimiento programado de pintura en la fecha solicitada..."
                rows={4}
                className="border border-border/80 rounded-xl bg-background font-medium resize-none text-sm"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/70">
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)} className="rounded-xl font-semibold border">
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleReject} className="rounded-xl font-semibold">
                Confirmar rechazo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default ManageReservations;
