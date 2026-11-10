import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { 
  MessageSquare, 
  Loader2, 
  Lightbulb, 
  AlertTriangle, 
  Wrench, 
  HelpCircle, 
  Edit2, 
  Calendar, 
  User, 
  Clock, 
  ArrowRight, 
  Filter,
  CheckCircle2,
  ShieldCheck,
  Send
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

interface Ticket {
  id: string;
  user_id: string;
  subject: string;
  description: string;
  category: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  profiles?: {
    full_name: string | null;
    email: string;
    apartment_number: string | null;
  };
}

const categoryConfig: Record<string, { icon: LucideIcon; color: string; bg: string; border: string; label: string }> = {
  suggestion: { icon: Lightbulb, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30', label: 'Sugerencia' },
  complaint: { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/30', label: 'Queja o reclamo' },
  maintenance: { icon: Wrench, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30', label: 'Mantenimiento' },
  other: { icon: HelpCircle, color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border', label: 'Otro' },
};

const ManageTickets = () => {
  const { isAdmin } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  
  const [newStatus, setNewStatus] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  const fetchTickets = async () => {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        toast.error('Error al cargar tickets');
        return;
      }
      
      const userIds = [...new Set((data || []).map(t => t.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, apartment_number')
        .in('id', userIds);
      
      const profilesMap = new Map(profiles?.map(p => [p.id, p]));
      const ticketsWithProfiles = (data || []).map(t => ({
        ...t,
        profiles: profilesMap.get(t.user_id),
      }));
      setTickets(ticketsWithProfiles as Ticket[]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchTickets();
    }
  }, [isAdmin]);

  const STATUS_LABELS: Record<string, string> = {
    open: 'abierta',
    in_progress: 'en progreso',
    resolved: 'resuelta',
    closed: 'cerrada',
  };

  const handleOpenEdit = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setNewStatus(ticket.status);
    setAdminNotes(ticket.admin_notes || '');
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('tickets')
        .update({
          status: newStatus,
          admin_notes: adminNotes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedTicket.id);

      if (error) {
        toast.error('Error al actualizar el ticket');
      } else {
        toast.success('Ticket respondido y actualizado con éxito');
        const { error: notifyError } = await supabase.from('notifications').insert({
          user_id: selectedTicket.user_id,
          title: 'Tu solicitud tiene una respuesta',
          message: `"${selectedTicket.subject}" ahora está ${STATUS_LABELS[newStatus] ?? newStatus}.`,
          type: newStatus === 'resolved' ? 'success' : 'info',
          link: '/tickets',
        });
        if (notifyError) console.warn('No se pudo notificar al residente:', notifyError.message);
        fetchTickets();
        setIsDialogOpen(false);
      }
    } catch (err) {
      toast.error('Error inesperado al guardar');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <StatusBadge status="primary">Abierta</StatusBadge>;
      case 'in_progress':
        return <StatusBadge status="warning">En progreso</StatusBadge>;
      case 'resolved':
        return <StatusBadge status="success">Resuelta</StatusBadge>;
      case 'closed':
        return <StatusBadge status="muted">Cerrada</StatusBadge>;
      default:
        return <StatusBadge status="muted">{status}</StatusBadge>;
    }
  };

  const filteredTickets = filterStatus === 'all' 
    ? tickets 
    : tickets.filter(t => t.status === filterStatus);

  const stats = {
    total: tickets.length,
    open: tickets.filter(t => t.status === 'open').length,
    inProgress: tickets.filter(t => t.status === 'in_progress').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[13px] font-medium text-primary">
                Comunidad
              </span>
            </div>
            <h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold text-foreground tracking-tight">
              Solicitudes
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base font-medium">
              Responde los reportes, quejas y sugerencias de los residentes.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-12 w-[180px] border border-border/80 rounded-xl bg-background font-semibold text-xs">
                <Filter className="w-3.5 h-3.5 mr-1.5 text-primary" />
                <SelectValue placeholder="Filtrar estado" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border border-border bg-card">
                <SelectItem value="all">Todos ({stats.total})</SelectItem>
                <SelectItem value="open">Abiertos ({stats.open})</SelectItem>
                <SelectItem value="in_progress">En progreso ({stats.inProgress})</SelectItem>
                <SelectItem value="resolved">Resueltos ({stats.resolved})</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Metric Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-card flex flex-col justify-between shadow-hairline">
            <span className="text-xs font-medium text-muted-foreground">Total recibidas</span>
            <span className="text-2xl font-semibold text-foreground mt-2">{stats.total}</span>
          </div>

          <div className="p-4 rounded-2xl border border-primary/30 bg-primary/5 flex flex-col justify-between">
            <span className="text-xs font-semibold text-primary">Por atender</span>
            <span className="text-2xl font-semibold text-primary mt-2">{stats.open}</span>
          </div>

          <div className="p-4 rounded-2xl border border-warning/30 bg-warning/5 flex flex-col justify-between">
            <span className="text-xs font-semibold text-warning">En progreso</span>
            <span className="text-2xl font-semibold text-warning mt-2">{stats.inProgress}</span>
          </div>

          <div className="p-4 rounded-2xl border border-success/30 bg-success/5 flex flex-col justify-between">
            <span className="text-xs font-semibold text-success">Solucionados</span>
            <span className="text-2xl font-semibold text-success mt-2">{stats.resolved}</span>
          </div>
        </div>

        {/* Tickets List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-2xl bg-card shadow-hairline">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
            <p className="text-xs font-medium text-muted-foreground">Cargando solicitudes...</p>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="border border-dashed border-border/80 rounded-2xl p-12 text-center bg-card">
            <MessageSquare className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <h3 className="font-semibold text-base text-foreground">No hay tickets en este estado</h3>
            <p className="text-xs text-muted-foreground mt-1">Prueba con otro filtro.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTickets.map((ticket) => {
              const config = categoryConfig[ticket.category] || categoryConfig.other;
              const Icon = config.icon;

              return (
                <div 
                  key={ticket.id} 
                  className="p-5 sm:p-6 rounded-2xl bg-card transition-[color,background-color,border-color,box-shadow,opacity,transform] space-y-4 shadow-hairline"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl ${config.bg} ${config.color} border ${config.border} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            Ticket #{ticket.id.slice(0, 8).toUpperCase()}
                          </span>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-xs font-semibold text-primary">
                            {config.label}
                          </span>
                        </div>
                        <h3 className="font-semibold text-lg text-foreground mt-0.5 leading-snug">{ticket.subject}</h3>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3">
                      {getStatusBadge(ticket.status)}
                      <Button
                        size="sm"
                        onClick={() => handleOpenEdit(ticket)}
                        className="h-10 px-4 rounded-xl font-semibold text-xs gap-1.5 shadow-sm"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Gestionar
                      </Button>
                    </div>
                  </div>

                  <p className="text-sm font-medium text-foreground/90 leading-relaxed whitespace-pre-wrap">
                    {ticket.description}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs font-medium text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-primary" />
                      <span>{ticket.profiles?.full_name || ticket.profiles?.email || 'Residente'}</span>
                      <span className="px-2 py-0.5 rounded-md bg-muted text-foreground border border-border font-semibold text-xs">
                        Apto {ticket.profiles?.apartment_number || 'S/N'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{format(new Date(ticket.created_at), "d 'de' MMMM, yyyy • h:mm a", { locale: es })}</span>
                    </div>
                  </div>

                  {ticket.admin_notes && (
                    <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-1 mt-2">
                      <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                        <ShieldCheck className="w-4 h-4" />
                        <span>Respuesta registrada</span>
                      </div>
                      <p className="text-xs sm:text-sm font-semibold text-foreground leading-relaxed">
                        {ticket.admin_notes}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Response Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-lg rounded-2xl bg-card p-6 sm:p-8">
            <DialogHeader className="border-b border-border/70 pb-4">
              <DialogTitle className="text-2xl font-semibold text-foreground">
                Responder y actualizar ticket
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm font-medium">
                Cambia el estado y escribe la respuesta que verá el residente.
              </DialogDescription>
            </DialogHeader>

            {selectedTicket && (
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-2">
                  <p className="font-semibold text-sm text-foreground">{selectedTicket.subject}</p>
                  <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{selectedTicket.description}</p>
                  <p className="text-xs font-semibold text-primary">
                    Solicitante: {selectedTicket.profiles?.full_name || 'Residente'} (Apto {selectedTicket.profiles?.apartment_number || 'S/N'})
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manage-tickets-nuevo-estado-del-caso" className="text-xs font-semibold text-foreground">Nuevo estado del caso *</Label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger id="manage-tickets-nuevo-estado-del-caso" className="h-12 border border-border/80 rounded-xl bg-background font-semibold">
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border border-border bg-card">
                      <SelectItem value="open">Abierta</SelectItem>
                      <SelectItem value="in_progress">En progreso</SelectItem>
                      <SelectItem value="resolved">Resuelta</SelectItem>
                      <SelectItem value="closed">Cerrada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manage-tickets-respuesta-al-residente" className="text-xs font-semibold text-foreground">Respuesta al residente</Label>
                  <Textarea id="manage-tickets-respuesta-al-residente"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Describe las acciones tomadas o la fecha estimada de resolución..."
                    rows={4}
                    className="border border-border/80 rounded-xl bg-background font-medium resize-none text-sm"
                  />
                </div>

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
                    disabled={isSubmitting} 
                    className="w-full sm:w-auto h-12 px-8 rounded-xl font-semibold shadow-sm gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      'Guardar respuesta'
                    )}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default ManageTickets;
