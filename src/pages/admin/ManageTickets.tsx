import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MessageSquare, Loader2, Lightbulb, AlertTriangle, Wrench, HelpCircle, Edit2, Calendar, User, Clock, ArrowRight, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

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

const categoryConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  suggestion: { icon: Lightbulb, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Sugerencia' },
  complaint: { icon: AlertTriangle, color: 'text-rose-500', bg: 'bg-rose-500/10', label: 'Queja / PQR' },
  maintenance: { icon: Wrench, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Mantenimiento' },
  other: { icon: HelpCircle, color: 'text-slate-500', bg: 'bg-slate-500/10', label: 'Otro' },
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
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Error al cargar los tickets');
      setLoading(false);
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
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) {
      fetchTickets();
    }
  }, [isAdmin]);

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

    const { error } = await supabase
      .from('tickets')
      .update({
        status: newStatus,
        admin_notes: adminNotes || null,
      })
      .eq('id', selectedTicket.id);

    if (error) {
      toast.error('Error al actualizar el ticket');
    } else {
      toast.success('Ticket actualizado con éxito');
      fetchTickets();
      setIsDialogOpen(false);
    }

    setIsSubmitting(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open': return <StatusBadge status="primary">Abierto</StatusBadge>;
      case 'in_progress': return <StatusBadge status="warning">En Progreso</StatusBadge>;
      case 'resolved': return <StatusBadge status="success">Resuelto</StatusBadge>;
      case 'closed': return <StatusBadge status="muted">Cerrado</StatusBadge>;
      default: return <StatusBadge status="muted">{status}</StatusBadge>;
    }
  };

  const filteredTickets = filterStatus === 'all' ? tickets : tickets.filter(t => t.status === filterStatus);

  const stats = {
    total: tickets.length,
    open: tickets.filter(t => t.status === 'open').length,
    inProgress: tickets.filter(t => t.status === 'in_progress').length,
    resolved: tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length,
  };

  return (
    <DashboardLayout>
      <div className="space-y-10 max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6"
        >
          <div>
            <h1 className="font-display text-4xl font-black flex items-center gap-4 text-foreground tracking-tight">
              <div className="p-3 bg-primary/10 rounded-2xl">
                <MessageSquare className="w-8 h-8 text-primary" />
              </div>
              Gestión de Tickets
            </h1>
            <p className="text-muted-foreground mt-2 text-lg font-medium">
              Revisa y responde a las solicitudes de los residentes
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Filter className="w-5 h-5 text-muted-foreground" />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-48 h-12 rounded-2xl border-none bg-muted/50 font-bold">
                <SelectValue placeholder="Filtrar..." />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-none shadow-xl">
                <SelectItem value="all">Todos ({stats.total})</SelectItem>
                <SelectItem value="open">Abiertos ({stats.open})</SelectItem>
                <SelectItem value="in_progress">En Progreso ({stats.inProgress})</SelectItem>
                <SelectItem value="resolved">Resueltos</SelectItem>
                <SelectItem value="closed">Cerrados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="card-elevated border-none bg-primary/5 p-4 text-center rounded-2xl">
            <p className="text-3xl font-black text-primary">{stats.open}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">Pendientes</p>
          </Card>
          <Card className="card-elevated border-none bg-amber-500/5 p-4 text-center rounded-2xl">
            <p className="text-3xl font-black text-amber-500">{stats.inProgress}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">En Progreso</p>
          </Card>
          <Card className="card-elevated border-none bg-emerald-500/5 p-4 text-center rounded-2xl">
            <p className="text-3xl font-black text-emerald-500">{stats.resolved}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">Resueltos</p>
          </Card>
        </div>

        {/* Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-lg rounded-3xl border-none shadow-2xl bg-card/95 backdrop-blur-xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black">Responder Ticket</DialogTitle>
              <DialogDescription className="font-medium">
                Actualiza el estado y agrega una respuesta para el residente
              </DialogDescription>
            </DialogHeader>
            {selectedTicket && (
              <form onSubmit={handleSubmit} className="space-y-6 pt-4">
                <div className="p-5 rounded-2xl bg-muted/30 space-y-3 border border-border/50">
                  <p className="font-black text-lg">{selectedTicket.subject}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{selectedTicket.description}</p>
                  <div className="flex items-center gap-2 text-[10px] font-black text-primary uppercase tracking-widest">
                    <User className="w-3.5 h-3.5" />
                    {selectedTicket.profiles?.full_name || selectedTicket.profiles?.email || 'Residente'}
                    {selectedTicket.profiles?.apartment_number && ` • Apto ${selectedTicket.profiles.apartment_number}`}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Estado *</Label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger className="h-14 bg-muted/50 border-none rounded-2xl">
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none shadow-xl">
                      <SelectItem value="open">Abierto</SelectItem>
                      <SelectItem value="in_progress">En Progreso</SelectItem>
                      <SelectItem value="resolved">Resuelto</SelectItem>
                      <SelectItem value="closed">Cerrado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Respuesta Administrativa</Label>
                  <Textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Escribe una respuesta o notas internas..."
                    rows={4}
                    className="bg-muted/50 border-none rounded-2xl resize-none font-medium"
                  />
                </div>

                <div className="flex justify-end gap-4 pt-4">
                  <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-xl h-12 font-bold">
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting} className="rounded-xl h-12 px-10 font-black shadow-lg shadow-primary/20">
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Actualizar Ticket'}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Ticket Cards */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cargando tickets...</p>
          </div>
        ) : filteredTickets.length === 0 ? (
          <Card className="card-elevated border-none shadow-2xl p-20 text-center bg-card/30 backdrop-blur-xl">
            <div className="w-24 h-24 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-8">
              <MessageSquare className="w-12 h-12 text-primary/30" />
            </div>
            <h3 className="font-black text-2xl text-foreground">Sin tickets</h3>
            <p className="text-muted-foreground font-medium mt-2 max-w-sm mx-auto">
              No hay solicitudes que coincidan con el filtro seleccionado.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            <AnimatePresence>
              {filteredTickets.map((ticket, index) => {
                const config = categoryConfig[ticket.category] || categoryConfig.other;
                const Icon = config.icon;
                
                return (
                  <motion.div
                    key={ticket.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                  >
                    <Card className="card-elevated border-none shadow-lg hover:shadow-2xl transition-all overflow-hidden bg-card/40 backdrop-blur-xl group">
                      <div className="flex flex-col">
                        <div className={`h-1.5 ${config.bg.replace('/10', '')}`} />
                        <CardContent className="p-5 lg:p-8">
                          <div className="flex flex-col lg:flex-row justify-between items-start gap-6">
                            <div className="flex flex-col sm:flex-row gap-4 lg:gap-6 items-start flex-1 w-full">
                              <div className={`p-3 lg:p-4 rounded-2xl ${config.bg} ${config.color} shadow-sm flex-shrink-0`}>
                                <Icon className="w-6 h-6 lg:w-8 lg:h-8" />
                              </div>
                              <div className="space-y-3 flex-1 w-full">
                                <div className="flex items-center gap-3 flex-wrap">
                                  <h4 className="font-black text-xl lg:text-2xl text-foreground leading-tight group-hover:text-primary transition-colors">{ticket.subject}</h4>
                                  <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full ${config.bg} ${config.color}`}>
                                    {config.label}
                                  </span>
                                </div>
                                <p className="text-muted-foreground text-sm lg:text-base font-medium leading-relaxed max-w-3xl line-clamp-3">
                                  {ticket.description}
                                </p>
                                
                                {ticket.admin_notes && (
                                  <div className="mt-4 p-4 lg:p-5 rounded-2xl bg-primary/[0.03] border border-primary/10 relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-primary/30" />
                                    <div className="flex items-center gap-2 mb-2">
                                      <User className="w-3.5 h-3.5 text-primary" />
                                      <p className="text-[9px] font-black text-primary uppercase tracking-widest">Respuesta Administrativa</p>
                                    </div>
                                    <p className="text-sm text-foreground font-semibold leading-relaxed">{ticket.admin_notes}</p>
                                  </div>
                                )}
                                
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 pt-2 text-muted-foreground/60">
                                  <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest">
                                    <User className="w-3 h-3" />
                                    {ticket.profiles?.full_name || ticket.profiles?.email || 'Residente'}
                                    {ticket.profiles?.apartment_number && ` • Apto ${ticket.profiles.apartment_number}`}
                                  </div>
                                  <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest">
                                    <Calendar className="w-3 h-3" />
                                    {format(new Date(ticket.created_at), "d 'de' MMM, yyyy", { locale: es })}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between lg:flex-col lg:items-end gap-4 w-full lg:w-auto lg:self-start border-t lg:border-none pt-4 lg:pt-0">
                              {getStatusBadge(ticket.status)}
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => handleOpenEdit(ticket)} 
                                className="rounded-full font-bold gap-2 px-6 h-10 border-2"
                              >
                                <Edit2 className="w-4 h-4" />
                                Responder
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ManageTickets;
