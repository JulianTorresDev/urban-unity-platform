import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2, Calendar as CalendarIcon, Clock } from 'lucide-react';
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
  const [viewDate, setViewDate] = useState<Date | null>(null);

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
    setViewDate(viewDate && isSameDay(viewDate, day) ? null : day);
  };

  const handleSlotClick = (day: Date, hour: number) => {
    if (isPastSlot(day, hour) || isSlotTaken(day, hour)) return;
    onSelectSlot?.(day, hour);
  };

  return (
    <Card className="border-none bg-muted/30 shadow-inner rounded-3xl overflow-hidden">
      <CardHeader className="pb-4 bg-background/40 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-black uppercase tracking-widest text-foreground">Disponibilidad</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 rounded-full hover:bg-primary/10"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-black min-w-[120px] text-center capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: es })}
            </span>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 rounded-full hover:bg-primary/10"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex gap-4 text-[10px] font-black uppercase tracking-widest mt-4">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-primary/20 border border-primary/40" />
            <span className="text-muted-foreground/60">Disponible</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500/30" />
            <span className="text-muted-foreground/60">Ocupado</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-muted/60" />
            <span className="text-muted-foreground/60">Pasado</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 px-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-2 mb-4">
              {['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'].map((day, i) => (
                <div key={i} className="text-center text-[10px] font-black text-muted-foreground/50 py-1">
                  {day}
                </div>
              ))}
              {Array.from({ length: monthStart.getDay() }).map((_, i) => (
                <div key={`empty-${i}`} />
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
                      relative aspect-square flex flex-col items-center justify-center text-xs font-bold rounded-2xl transition-all
                      ${isToday ? 'border-2 border-primary' : 'border border-transparent'}
                      ${isPast ? 'text-muted-foreground/30 cursor-not-allowed' : 'hover:bg-primary/10 cursor-pointer'}
                      ${isSelected ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-110 z-10' : 'text-foreground'}
                    `}
                  >
                    {format(day, 'd')}
                    {hasBookings && !isPast && !isSelected && (
                      <div className="absolute bottom-1.5 w-1 h-1 rounded-full bg-rose-500" />
                    )}
                  </button>
                );
              })}
            </div>

            <AnimatePresence>
              {viewDate && (
                <div className="mt-4 pt-6 border-t border-border/50 animate-fade-in">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="w-4 h-4 text-primary" />
                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                      Horarios para el {format(viewDate, "d 'de' MMMM", { locale: es })}
                    </p>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
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
                            p-3 text-xs font-bold rounded-xl transition-all border
                            ${isPast ? 'bg-muted/40 text-muted-foreground/30 border-transparent cursor-not-allowed' : ''}
                            ${isTaken && !isPast ? 'bg-rose-500/10 text-rose-600 border-rose-200 cursor-not-allowed' : ''}
                            ${!isTaken && !isPast ? 'bg-background hover:bg-primary/10 border-border/50 hover:border-primary/30 cursor-pointer' : ''}
                            ${isSelectedSlot ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20 scale-105' : ''}
                          `}
                        >
                          {format(setHours(new Date(), hour), 'h a')}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </AnimatePresence>
          </>
        )}
      </CardContent>
    </Card>
  );
};
