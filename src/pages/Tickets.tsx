import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MessageSquare, Plus, Loader2, Lightbulb, AlertTriangle, Wrench, HelpCircle, ArrowRight, Calendar, User, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface Ticket {
  id: string;
  subject: string;
  description: string;
  category: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

const categoryIcons: Record<string, any> = {
  suggestion: { icon: Lightbulb, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  complaint: { icon: AlertTriangle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  maintenance: { icon: Wrench, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  other: { icon: HelpCircle, color: 'text-slate-500', bg: 'bg-slate-500/10' },
};

const Tickets = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');

  const fetchTickets = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Error al cargar tickets');
    } else {
      setTickets(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTickets();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim() || !category) {
      toast.error('Por favor completa todos los campos requeridos');
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.from('tickets').insert({
      user_id: user?.id,
      subject,
      description,
      category,
    });

    if (error) {
      toast.error('Error al crear el ticket');
    } else {
      toast.success('Ticket enviado con éxito');
      fetchTickets();
      setIsDialogOpen(false);
      resetForm();
    }
    setIsSubmitting(false);
  };

  const resetForm = () => {
    setSubject('');
    setDescription('');
    setCategory('');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <StatusBadge status="primary">Abierto</StatusBadge>;
      case 'in_progress':
        return <StatusBadge status="warning">En Progreso</StatusBadge>;
      case 'resolved':
        return <StatusBadge status="success">Resuelto</StatusBadge>;
      case 'closed':
        return <StatusBadge status="muted">Cerrado</StatusBadge>;
      default:
        return <StatusBadge status="muted">{status}</StatusBadge>;
    }
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'suggestion': return 'Sugerencia';
      case 'complaint': return 'Queja / PQR';
      case 'maintenance': return 'Mantenimiento';
      default: return 'Otro';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-10 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h1 className="font-display text-4xl font-black flex items-center gap-4 text-foreground tracking-tight">
              <div className="p-3 bg-primary/10 rounded-2xl">
                <MessageSquare className="w-8 h-8 text-primary" />
              </div>
              Centro de Atención (PQR)
            </h1>
            <p className="text-muted-foreground mt-2 text-lg font-medium">
              Envía sugerencias, reporta mantenimientos o radica peticiones oficiales
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="gap-2 rounded-2xl px-8 shadow-xl shadow-primary/20 h-14 font-black">
                <Plus className="w-5 h-5" />
                NUEVA SOLICITUD
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg rounded-3xl border-none shadow-2xl bg-card/95 backdrop-blur-xl">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black">Crear Solicitud</DialogTitle>
                <DialogDescription className="font-medium">
                  Nuestro equipo revisará tu caso en un plazo máximo de 24-48 horas hábiles.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-6 pt-4">
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Categoría</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="h-14 bg-muted/50 border-none rounded-2xl focus:ring-primary/20">
                      <SelectValue placeholder="¿Qué tipo de solicitud es?" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none shadow-xl">
                      <SelectItem value="suggestion">Sugerencia</SelectItem>
                      <SelectItem value="complaint">Queja / PQR</SelectItem>
                      <SelectItem value="maintenance">Mantenimiento</SelectItem>
                      <SelectItem value="other">Otro asunto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Asunto</Label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Ej: Falla en luminaria pasillo 4"
                    required
                    className="h-14 bg-muted/50 border-none rounded-2xl focus:ring-primary/20 font-medium"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Descripción Detallada</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe los detalles de tu solicitud..."
                    rows={5}
                    required
                    className="bg-muted/50 border-none rounded-2xl focus:ring-primary/20 font-medium resize-none"
                  />
                </div>

                <div className="flex justify-end gap-4 pt-4">
                  <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-xl h-12 font-bold">
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting} className="rounded-xl h-12 px-10 font-black shadow-lg shadow-primary/20">
                    {isSubmitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      'ENVIAR TICKET'
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Tickets Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <Loader2 className="w-10 h-10 lg:w-12 lg:h-12 animate-spin text-primary" />
            <p className="text-[10px] lg:text-sm font-black uppercase tracking-widest text-muted-foreground">Sincronizando solicitudes...</p>
          </div>
        ) : tickets.length === 0 ? (
          <Card className="card-elevated border-none shadow-2xl p-20 text-center bg-card/30 backdrop-blur-xl">
            <div className="w-24 h-24 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-8">
              <MessageSquare className="w-12 h-12 text-primary/30" />
            </div>
            <h3 className="font-black text-2xl text-foreground">Bandeja de entrada vacía</h3>
            <p className="text-muted-foreground font-medium mt-2 max-w-sm mx-auto">
              No has radicado ninguna solicitud todavía. Presiona el botón "Nueva Solicitud" para empezar.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            <AnimatePresence>
              {tickets.map((ticket, index) => {
                const config = categoryIcons[ticket.category] || categoryIcons.other;
                const Icon = config.icon;
                
                return (
                  <motion.div
                    key={ticket.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card className="card-elevated border-none shadow-lg hover:shadow-2xl transition-all overflow-hidden bg-card/40 backdrop-blur-xl group">
                      <div className="flex flex-col">
                        <div className={`h-1.5 lg:h-auto lg:w-2 ${config.bg.replace('/10', '')}`} />
                        <CardContent className="p-5 lg:p-8 flex-1">
                          <div className="flex flex-col lg:flex-row justify-between items-start gap-6">
                            <div className="flex flex-col sm:flex-row gap-4 lg:gap-6 items-start flex-1 w-full">
                              <div className={`p-3 lg:p-4 rounded-2xl ${config.bg} ${config.color} shadow-sm flex-shrink-0`}>
                                <Icon className="w-6 h-6 lg:w-8 lg:h-8" />
                              </div>
                              <div className="space-y-3 flex-1 w-full">
                                <div className="flex items-center gap-3 flex-wrap">
                                  <h4 className="font-black text-xl lg:text-2xl text-foreground leading-tight group-hover:text-primary transition-colors">{ticket.subject}</h4>
                                  <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full ${config.bg} ${config.color}`}>
                                    {getCategoryLabel(ticket.category)}
                                  </span>
                                </div>
                                <p className="text-muted-foreground text-sm lg:text-lg font-medium leading-relaxed max-w-3xl">
                                  {ticket.description}
                                </p>
                                
                                {ticket.admin_notes && (
                                  <motion.div 
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="mt-4 lg:mt-6 p-4 lg:p-6 rounded-2xl lg:rounded-3xl bg-primary/[0.03] border border-primary/10 relative overflow-hidden"
                                  >
                                    <div className="absolute top-0 left-0 w-1 h-full bg-primary/30" />
                                    <div className="flex items-center gap-2 mb-2 lg:mb-3">
                                      <User className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-primary" />
                                      <p className="text-[9px] font-black text-primary uppercase tracking-widest">Respuesta Administrativa</p>
                                    </div>
                                    <p className="text-sm lg:text-base text-foreground font-semibold leading-relaxed">{ticket.admin_notes}</p>
                                  </motion.div>
                                )}
                                
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 pt-2 text-muted-foreground/60">
                                  <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest">
                                    <Calendar className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                                    {format(new Date(ticket.created_at), 'd MMM, yyyy', { locale: es })}
                                  </div>
                                  <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest">
                                    <Clock className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                                    ID: {ticket.id.slice(0, 8).toUpperCase()}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between lg:flex-col lg:items-end gap-4 w-full lg:w-auto lg:self-start border-t lg:border-none pt-4 lg:pt-0">
                              {getStatusBadge(ticket.status)}
                              <Button variant="ghost" size="sm" className="rounded-full text-[10px] font-bold lg:opacity-0 group-hover:opacity-100 transition-opacity p-0 h-auto lg:h-10 lg:px-4">
                                Detalles <ArrowRight className="w-3 h-3 ml-1" />
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

export default Tickets;
