import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CalendarDays, Loader2, TreesIcon, Building, Car, Check, X, Calendar as CalendarIcon, DollarSign } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths } from 'date-fns';
import { toast } from 'sonner';

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

const resourceIcons: Record<string, React.ReactNode> = {
  'Green Spaces': <TreesIcon className="w-5 h-5" />,
  'Community Hall': <Building className="w-5 h-5" />,
  'Visitor Parking': <Car className="w-5 h-5" />,
};

const resourceColors: Record<string, string> = {
  'Green Spaces': 'bg-green-500',
  'Community Hall': 'bg-blue-500',
  'Visitor Parking': 'bg-amber-500',
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
    setLoading(false);
  };

  useEffect(() => {
    fetchReservations();

    // Subscribe to realtime updates
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

  const sendNotification = async (reservation: Reservation, action: 'approved' | 'rejected', reason?: string) => {
    try {
      await supabase.functions.invoke('send-notification', {
        body: {
          type: 'reservation_status_change',
          reservationId: reservation.id,
          recipientEmail: reservation.profiles?.email,
          recipientName: reservation.profiles?.full_name,
          action,
          reason,
        },
      });
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
    // In-app notification
    const isApproved = action === 'approved';
    await supabase.from('notifications').insert({
      user_id: reservation.user_id,
      title: isApproved ? '✅ Reservación aprobada' : '❌ Reservación rechazada',
      message: isApproved
        ? `Tu reservación de ${reservation.resources?.name || 'recurso'} ha sido aprobada.`
        : `Tu reservación fue rechazada.${reason ? ` Motivo: ${reason}` : ''}`,
      type: isApproved ? 'success' : 'error',
      link: '/reservations',
    });
  };

  const handleApprove = async (reservation: Reservation) => {
    setProcessingId(reservation.id);
    const { error } = await supabase
      .from('reservations')
      .update({ status: 'confirmed' })
      .eq('id', reservation.id);

    if (error) {
      toast.error('Failed to approve reservation');
    } else {
      toast.success('Reservation approved');
      await sendNotification(reservation, 'approved');
      fetchReservations();
    }
    setProcessingId(null);
  };

  const openRejectDialog = (reservation: Reservation) => {
    setSelectedReservation(reservation);
    setRejectionReason('');
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!selectedReservation) return;
    
    setProcessingId(selectedReservation.id);
    setRejectDialogOpen(false);
    
    const { error } = await supabase
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', selectedReservation.id);

    if (error) {
      toast.error('Failed to reject reservation');
    } else {
      toast.success('Reservation rejected');
      await sendNotification(selectedReservation, 'rejected', rejectionReason);
      fetchReservations();
    }
    setProcessingId(null);
    setSelectedReservation(null);
    setRejectionReason('');
  };

  const pendingReservations = reservations.filter(r => r.status === 'pending');
  const confirmedReservations = reservations.filter(r => r.status === 'confirmed');
  const cancelledReservations = reservations.filter(r => r.status === 'cancelled');

  // Calendar view logic
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  const getReservationsForDay = (day: Date) => {
    return reservations.filter(r => 
      r.status !== 'cancelled' && isSameDay(new Date(r.start_time), day)
    );
  };

  const renderReservationCard = (reservation: Reservation, showActions: boolean = false) => (
    <div
      key={reservation.id}
      className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-border/50 hover:border-primary/30 transition-colors gap-4"
    >
      <div className="flex items-center gap-4">
        <div className="p-3 rounded-xl bg-primary/10 text-primary">
          {resourceIcons[reservation.resources?.name || ''] || <Building className="w-5 h-5" />}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-semibold">{reservation.resources?.name}</h4>
            {reservation.price !== null && reservation.price > 0 && (
              <span className="text-sm font-medium text-primary flex items-center gap-0.5">
                <DollarSign className="w-3 h-3" />
                {reservation.price.toFixed(2)}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {format(new Date(reservation.start_time), 'MMM d, yyyy')} •{' '}
            {format(new Date(reservation.start_time), 'h:mm a')} -{' '}
            {format(new Date(reservation.end_time), 'h:mm a')}
          </p>
          <p className="text-sm text-muted-foreground">
            Requested by: {reservation.profiles?.full_name || 'Unknown'} 
            {reservation.profiles?.apartment_number && ` (Apt ${reservation.profiles.apartment_number})`}
          </p>
          {reservation.notes && (
            <p className="text-sm text-muted-foreground mt-1 italic">"{reservation.notes}"</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 self-end sm:self-auto">
        {showActions ? (
          <>
            <Button
              size="sm"
              onClick={() => handleApprove(reservation)}
              disabled={processingId === reservation.id}
            >
              {processingId === reservation.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4 mr-1" />
                  Approve
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => openRejectDialog(reservation)}
              disabled={processingId === reservation.id}
            >
              <X className="w-4 h-4 mr-1" />
              Reject
            </Button>
          </>
        ) : (
          <StatusBadge 
            status={
              reservation.status === 'confirmed' ? 'success' : 
              reservation.status === 'cancelled' ? 'destructive' : 'warning'
            }
          >
            {reservation.status === 'confirmed' ? 'Confirmed' : 
             reservation.status === 'cancelled' ? 'Cancelled' : 'Pending'}
          </StatusBadge>
        )}
      </div>
    </div>
  );

  const renderCalendarView = () => (
    <Card className="card-elevated">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Reservation Calendar</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              Previous
            </Button>
            <span className="font-semibold min-w-[140px] text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <Button variant="outline" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              Next
            </Button>
          </div>
        </div>
        <div className="flex gap-4 mt-4">
          {Object.entries(resourceColors).map(([name, color]) => (
            <div key={name} className="flex items-center gap-2 text-sm">
              <div className={`w-3 h-3 rounded-full ${color}`} />
              <span>{name}</span>
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="p-2 text-center font-semibold text-muted-foreground text-sm">
              {day}
            </div>
          ))}
          {/* Empty cells for days before month starts */}
          {Array.from({ length: monthStart.getDay() }).map((_, i) => (
            <div key={`empty-start-${i}`} className="p-2 min-h-[100px]" />
          ))}
          {daysInMonth.map(day => {
            const dayReservations = getReservationsForDay(day);
            const isToday = isSameDay(day, new Date());
            
            return (
              <div
                key={day.toISOString()}
                className={`p-2 min-h-[100px] border rounded-lg ${
                  isToday ? 'border-primary bg-primary/5' : 'border-border/50'
                } ${!isSameMonth(day, currentMonth) ? 'opacity-50' : ''}`}
              >
                <div className={`text-sm font-medium mb-1 ${isToday ? 'text-primary' : ''}`}>
                  {format(day, 'd')}
                </div>
                <div className="space-y-1">
                  {dayReservations.slice(0, 3).map(r => (
                    <div
                      key={r.id}
                      className={`text-xs p-1 rounded truncate text-white ${resourceColors[r.resources?.name || ''] || 'bg-gray-500'} ${r.status === 'pending' ? 'opacity-60' : ''}`}
                      title={`${r.resources?.name} - ${r.profiles?.full_name || 'Unknown'} (${format(new Date(r.start_time), 'h:mm a')})`}
                    >
                      {format(new Date(r.start_time), 'h:mm a')} {r.resources?.name?.charAt(0)}
                    </div>
                  ))}
                  {dayReservations.length > 3 && (
                    <div className="text-xs text-muted-foreground">
                      +{dayReservations.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold">Access Denied</h2>
          <p className="text-muted-foreground">You don't have permission to access this page.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold flex items-center gap-3">
              <CalendarDays className="w-8 h-8 text-primary" />
              Manage Reservations
            </h1>
            <p className="text-muted-foreground mt-1">
              Approve or reject resident reservation requests
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant={activeView === 'list' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setActiveView('list')}
            >
              <CalendarDays className="w-4 h-4 mr-2" />
              List View
            </Button>
            <Button 
              variant={activeView === 'calendar' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setActiveView('calendar')}
            >
              <CalendarIcon className="w-4 h-4 mr-2" />
              Calendar View
            </Button>
          </div>
        </div>

        {activeView === 'calendar' ? (
          renderCalendarView()
        ) : (
          <Tabs defaultValue="pending" className="w-full">
            <TabsList className="grid w-full grid-cols-3 max-w-md">
              <TabsTrigger value="pending" className="relative">
                Pending
                {pendingReservations.length > 0 && (
                  <span className="ml-2 bg-warning text-warning-foreground text-xs px-2 py-0.5 rounded-full">
                    {pendingReservations.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="confirmed">Confirmed</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-6">
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle>Pending Reservations</CardTitle>
                  <CardDescription>Reservations awaiting your approval</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                  ) : pendingReservations.length === 0 ? (
                    <div className="text-center py-12">
                      <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="font-semibold text-lg">No pending reservations</h3>
                      <p className="text-muted-foreground">All caught up!</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {pendingReservations.map(r => renderReservationCard(r, true))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="confirmed" className="mt-6">
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle>Confirmed Reservations</CardTitle>
                  <CardDescription>Approved reservations</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                  ) : confirmedReservations.length === 0 ? (
                    <div className="text-center py-12">
                      <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="font-semibold text-lg">No confirmed reservations</h3>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {confirmedReservations.map(r => renderReservationCard(r, false))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="cancelled" className="mt-6">
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle>Cancelled Reservations</CardTitle>
                  <CardDescription>Rejected or cancelled reservations</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                  ) : cancelledReservations.length === 0 ? (
                    <div className="text-center py-12">
                      <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="font-semibold text-lg">No cancelled reservations</h3>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {cancelledReservations.map(r => renderReservationCard(r, false))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Rejection Reason Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Reservation</DialogTitle>
              <DialogDescription>
                Provide a reason for rejecting this reservation. This will be sent to the resident.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Rejection Reason</Label>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g., The requested time slot conflicts with scheduled maintenance..."
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleReject}>
                Reject Reservation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default ManageReservations;
