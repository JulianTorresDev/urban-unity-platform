import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2, Calendar as CalendarIcon, Clock, CheckCircle2 } from 'lucide-react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  addMonths, 
  subMonths,
  setHours,
  setMinutes,
  isBefore,
  startOfDay
} from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';

interface Reservation {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
}

interface AvailabilityCalendarProps {
  resourceId: string;
  resourceName: string;
  onSelectSlot?: (date: Date, hour: number) => void;
  selectedDate?: Date;
  selectedHour?: number;
}

const timeSlots = Array.from({ length: 14 }, (_, i) => 8 + i); // 8 AM to 9 PM

export const AvailabilityCalendar = ({ 
  resourceId, 
  resourceName, 
  onSelectSlot,
  selectedDate,
  selectedHour
}: AvailabilityCalendarProps) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDate, setViewDate] = useState<Date | null>(selectedDate || new Date());

  useEffect(() => {
    if (!resourceId) return;
    
    const fetchReservations = async () => {
      setLoading(true);
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      
      const { data } = await supabase
        .from('reservations')
        .select('id, start_time, end_time, status')
        .eq('resource_id', resourceId)
        .in('status', ['pending', 'confirmed'])
        .gte('start_time', monthStart.toISOString())
        .lte('start_time', monthEnd.toISOString());
      
      setReservations(data || []);
      setLoading(false);
    };

    fetchReservations();

    const channel = supabase
      .channel(`availability-${resourceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations',
          filter: `resource_id=eq.${resourceId}`
        },
        () => {
          fetchReservations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [resourceId, currentMonth]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const getReservationsForDay = (day: Date) => {
    return reservations.filter(r => isSameDay(new Date(r.start_time), day));
  };

  const isSlotTaken = (day: Date, hour: number) => {
    const slotStart = setMinutes(setHours(day, hour), 0);
    const slotEnd = setMinutes(setHours(day, hour + 1), 0);
    
    return reservations.some(r => {
      const resStart = new Date(r.start_time);
      const resEnd = new Date(r.end_time);
      return resStart < slotEnd && resEnd > slotStart;
    });
  };

  const isPastSlot = (day: Date, hour: number) => {
    const slotStart = setMinutes(setHours(day, hour), 0);
    return isBefore(slotStart, new Date());
  };

  const handleDayClick = (day: Date) => {
    if (isBefore(startOfDay(day), startOfDay(new Date()))) return;
    setViewDate(day);
  };

  const handleSlotClick = (day: Date, hour: number) => {
    if (isPastSlot(day, hour) || isSlotTaken(day, hour)) return;
    onSelectSlot?.(day, hour);
  };

  return (
    <div className="rounded-2xl bg-card overflow-hidden shadow-hairline">
      {/* Calendar Header */}
      <div className="p-4 bg-muted/30 border-b border-border/70 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center text-muted-foreground">
            <CalendarIcon className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-foreground">Disponibilidad</h4>
            <p className="text-xs text-muted-foreground font-medium">Toca un día para ver los turnos disponibles</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-background border border-border/80 rounded-xl p-1 shadow-xs">
          <Button 
            type="button"
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 rounded-lg hover:bg-muted text-foreground"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            title="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-semibold min-w-[130px] text-center capitalize text-foreground">
            {format(currentMonth, 'MMMM yyyy', { locale: es })}
          </span>
          <Button 
            type="button"
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 rounded-lg hover:bg-muted text-foreground"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            title="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {/* Status Indicators */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold pb-4 mb-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-success/20 border border-success" />
            <span className="text-muted-foreground">Libre</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-destructive/20 border border-destructive" />
            <span className="text-muted-foreground">Con reservas</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-primary border border-primary" />
            <span className="text-foreground">Seleccionado</span>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
            <span className="text-xs font-semibold">Consultando calendario...</span>
          </div>
        ) : (
          <>
            {/* Days grid */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-4">
              {['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'].map((day, i) => (
                <div key={i} className="text-center text-xs font-medium text-muted-foreground py-1">
                  {day}
                </div>
              ))}
              {Array.from({ length: monthStart.getDay() }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}
              {daysInMonth.map(day => {
                const dayReservations = getReservationsForDay(day);
                const isToday = isSameDay(day, new Date());
                const isPast = isBefore(startOfDay(day), startOfDay(new Date()));
                const isSelected = viewDate && isSameDay(viewDate, day);
                const hasBookings = dayReservations.length > 0;
                
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => handleDayClick(day)}
                    disabled={isPast}
                    className={`
                      relative aspect-square min-h-[40px] flex flex-col items-center justify-center text-xs font-semibold rounded-xl transition-[color,background-color,border-color,box-shadow,opacity,transform] border
                      ${isPast 
                        ? 'border-transparent text-muted-foreground/30 bg-muted/20 cursor-not-allowed' 
                        : isSelected
                          ? 'border-primary bg-primary text-primary-foreground shadow-md scale-105 z-10'
                          : isToday
                            ? 'border-primary/80 bg-primary/5 text-foreground hover:bg-primary/10 cursor-pointer'
                            : 'border-border/60 bg-background hover:border-primary/50 text-foreground cursor-pointer'
                      }
                    `}
                  >
                    <span>{format(day, 'd')}</span>
                    {hasBookings && !isPast && !isSelected && (
                      <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-destructive" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Time Slot Picker for selected day */}
            <AnimatePresence mode="wait">
              {viewDate && (
                <motion.div 
                  key={viewDate.toISOString()}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mt-4 pt-4 border-t border-border/70"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-primary" />
                      <h5 className="text-xs font-semibold text-foreground">
                        Turnos para el {format(viewDate, "EEEE d 'de' MMMM", { locale: es })}
                      </h5>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">Horario: 8:00 AM - 9:00 PM</span>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
                    {timeSlots.map(hour => {
                      const isTaken = isSlotTaken(viewDate, hour);
                      const isPast = isPastSlot(viewDate, hour);
                      const isSelectedSlot = selectedDate && selectedHour === hour && isSameDay(selectedDate, viewDate);
                      
                      return (
                        <button
                          key={hour}
                          type="button"
                          onClick={() => handleSlotClick(viewDate, hour)}
                          disabled={isTaken || isPast}
                          className={`
                            py-3 px-2 min-h-[46px] text-xs font-semibold rounded-xl transition-[color,background-color,border-color,box-shadow,opacity,transform] border text-center flex flex-col items-center justify-center
                            ${isPast 
                              ? 'bg-muted/30 text-muted-foreground/30 border-transparent cursor-not-allowed' 
                              : isTaken 
                                ? 'bg-destructive/10 text-destructive border-destructive/40 cursor-not-allowed font-semibold'
                                : isSelectedSlot
                                  ? 'bg-primary text-primary-foreground border-primary shadow-md scale-102 ring-2 ring-primary/30'
                                  : 'bg-background text-foreground border-border/80 hover:border-primary hover:bg-primary/5 cursor-pointer'
                            }
                          `}
                        >
                          <span>{format(setHours(new Date(), hour), 'h:00 a')}</span>
                          <span className="text-xs font-semibold mt-0.5 opacity-80">
                            {isPast ? 'Pasado' : isTaken ? 'Ocupado' : isSelectedSlot ? 'Elegido' : 'Libre'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
};
