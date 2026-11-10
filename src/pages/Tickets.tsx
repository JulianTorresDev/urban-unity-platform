import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
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
import { 
  MessageSquare, 
  Plus, 
  Loader2, 
  Lightbulb, 
  AlertTriangle, 
  Wrench, 
  HelpCircle, 
  ArrowRight, 
  Calendar, 
  User, 
  Clock, 
  ShieldCheck, 
  CheckCircle2,
  FileText
} from 'lucide-react';
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

const categoryIcons: Record<string, { icon: LucideIcon; color: string; bg: string; border: string; label?: string }> = {
  suggestion: { icon: Lightbulb, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30', label: 'Sugerencia' },
  complaint: { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/30', label: 'Queja o reclamo' },
  maintenance: { icon: Wrench, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30', label: 'Reporte técnico' },
  other: { icon: HelpCircle, color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border', label: 'Consulta general' },
};

const Tickets = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('maintenance');

  const fetchTickets = async () => {
    if (!user) return;

    try {
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
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
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
    try {
      const { error } = await supabase.from('tickets').insert({
        user_id: user?.id,
        subject: subject.trim(),
        description: description.trim(),
        category,
      });

      if (error) {
        toast.error('No se pudo enviar la solicitud: ' + error.message);
      } else {
        toast.success('Solicitud enviada. La administración te responderá pronto.');
        fetchTickets();
        setIsDialogOpen(false);
        resetForm();
      }
    } catch (err) {
      toast.error('Ocurrió un error al enviar el ticket');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSubject('');
    setDescription('');
    setCategory('maintenance');
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
              Reporta daños, haz consultas o envía sugerencias, y sigue su estado.
            </p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                size="lg" 
                className="h-12 px-6 text-[15px] flex-shrink-0"
              >
                <Plus className="w-5 h-5" />
                Nueva solicitud
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-lg rounded-2xl bg-card p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
              <DialogHeader className="border-b border-border/70 pb-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <FileText className="w-4 h-4" />
                  <span>Nueva solicitud</span>
                </div>
                <DialogTitle className="text-2xl font-semibold text-foreground mt-1">
                  Crear solicitud de servicio
                </DialogTitle>
                <DialogDescription className="text-muted-foreground text-sm font-medium">
                  La administración atenderá tu caso en un plazo estándar de 24 a 48 horas hábiles.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-5 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="tickets-tipo-de-caso-categoria" className="text-xs font-semibold text-foreground">
                    Tipo de Caso / Categoría *
                  </Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger id="tickets-tipo-de-caso-categoria" className="h-12">
                      <SelectValue placeholder="Selecciona categoría" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border border-border bg-card">
                      <SelectItem value="maintenance" className="py-2.5">
                        Mantenimiento o daño en áreas comunes
                      </SelectItem>
                      <SelectItem value="suggestion" className="py-2.5">
                        Sugerencia o convivencia
                      </SelectItem>
                      <SelectItem value="complaint" className="py-2.5">
                        Queja o reclamo
                      </SelectItem>
                      <SelectItem value="other" className="py-2.5">
                        Otra consulta
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tickets-asunto-del-requerimiento" className="text-xs font-semibold text-foreground">
                    Asunto del Requerimiento *
                  </Label>
                  <Input id="tickets-asunto-del-requerimiento"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Ej: Falla en luminaria pasillo Torre B"
                    required
                    className="h-12"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tickets-descripcion-detallada" className="text-xs font-semibold text-foreground">
                    Descripción Detallada *
                  </Label>
                  <Textarea id="tickets-descripcion-detallada"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Por favor explica claramente la situación, ubicación exacta y detalles pertinentes..."
                    rows={4}
                    required
                    className="border border-border/80 rounded-xl bg-background font-medium resize-none min-h-[110px]"
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
                        Enviando…
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

        {/* Quick Category Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Object.entries(categoryIcons).map(([key, item]) => {
            const count = tickets.filter(t => t.category === key).length;
            const Icon = item.icon;
            return (
              <div 
                key={key}
                className="p-4 rounded-2xl bg-card flex flex-col justify-between shadow-hairline"
              >
                <div className="flex items-center justify-between">
                  <div className={`w-10 h-10 rounded-xl ${item.bg} ${item.color} border ${item.border} flex items-center justify-center`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xl font-semibold text-foreground">{count}</span>
                </div>
                <div className="mt-3">
                  <p className="text-xs font-semibold text-foreground truncate">{item.label}</p>
                  <p className="text-xs font-medium text-muted-foreground">{count} recibidas</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tickets Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              Historial de solicitudes
            </h2>
            <span className="text-xs font-medium text-muted-foreground">
              {tickets.length} en total
            </span>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 rounded-2xl bg-card shadow-hairline">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
              <p className="text-xs font-medium text-muted-foreground">Cargando solicitudes...</p>
            </div>
          ) : tickets.length === 0 ? (
            <div className="border border-dashed border-border/80 rounded-2xl p-12 text-center bg-card">
              <div className="w-16 h-16 bg-muted rounded-2xl border border-border/70 flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-8 h-8 text-muted-foreground/60" />
              </div>
              <h3 className="font-semibold text-lg text-foreground">Sin solicitudes</h3>
              <p className="text-muted-foreground text-sm font-medium mt-1 max-w-md mx-auto">
                Para reportar un daño o hacer una consulta, pulsa "Nueva solicitud".
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {tickets.map((ticket) => {
                const config = categoryIcons[ticket.category] || categoryIcons.other;
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
                        <span className="text-xs font-medium text-muted-foreground">
                          {format(new Date(ticket.created_at), "d 'de' MMMM, yyyy", { locale: es })}
                        </span>
                        {getStatusBadge(ticket.status)}
                      </div>
                    </div>

                    <p className="text-sm font-medium text-foreground/90 leading-relaxed whitespace-pre-wrap">
                      {ticket.description}
                    </p>

                    {/* Official Admin Response */}
                    {ticket.admin_notes && (
                      <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-2">
                        <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                          <ShieldCheck className="w-4 h-4" />
                          <span>Respuesta de la administración</span>
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
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Tickets;
