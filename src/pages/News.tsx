import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Newspaper, Plus, Edit2, Trash2, Loader2, Calendar, Megaphone, Bell, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

interface NewsItem {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  created_at: string;
  author_id: string | null;
}

const News = () => {
  const { user, isAdmin } = useAuth();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNews, setEditingNews] = useState<NewsItem | null>(null);
  const [formData, setFormData] = useState({ title: '', content: '', image_url: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchNews = async () => {
    try {
      const { data, error } = await supabase
        .from('news')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        toast.error('Error al cargar noticias');
      } else {
        setNews(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.content.trim()) {
      toast.error('Por favor completa todos los campos requeridos');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingNews) {
        const { error } = await supabase
          .from('news')
          .update({
            title: formData.title.trim(),
            content: formData.content.trim(),
            image_url: formData.image_url.trim() || null,
          })
          .eq('id', editingNews.id);

        if (error) {
          toast.error('Error al actualizar noticia');
          return;
        }
        toast.success('Comunicado actualizado correctamente');
        fetchNews();
      } else {
        const { error } = await supabase
          .from('news')
          .insert({
            title: formData.title.trim(),
            content: formData.content.trim(),
            image_url: formData.image_url.trim() || null,
            author_id: user?.id,
          });

        if (error) {
          // Se mantiene abierto el formulario para no perder lo escrito
          toast.error('Error al publicar noticia');
          return;
        }
        toast.success('Comunicado publicado exitosamente');
        fetchNews();
      }

      setIsDialogOpen(false);
      setEditingNews(null);
      setFormData({ title: '', content: '', image_url: '' });
    } catch (err) {
      toast.error('Error al guardar la noticia');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (item: NewsItem) => {
    setEditingNews(item);
    setFormData({
      title: item.title,
      content: item.content,
      image_url: item.image_url || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este comunicado?')) return;

    const { error } = await supabase.from('news').delete().eq('id', id);
    if (error) {
      toast.error('Error al eliminar noticia');
    } else {
      toast.success('Comunicado eliminado con éxito');
      fetchNews();
    }
  };

  const openCreateDialog = () => {
    setEditingNews(null);
    setFormData({ title: '', content: '', image_url: '' });
    setIsDialogOpen(true);
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
              Comunicados
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base font-medium">
              {isAdmin 
                ? 'Emite circulares oficiales, asambleas y novedades prioritarias para todos los residentes'
                : 'Mantente informado sobre asambleas, mantenimientos preventivos y decisiones de la comunidad'
              }
            </p>
          </div>

          {isAdmin && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  onClick={openCreateDialog}
                  size="lg" 
                  className="h-12 px-6 text-[15px] flex-shrink-0"
                >
                  <Plus className="w-5 h-5" />
                  Publicar comunicado
                </Button>
              </DialogTrigger>

              <DialogContent className="sm:max-w-lg rounded-2xl bg-card p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
                <DialogHeader className="border-b border-border/70 pb-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                    <Megaphone className="w-4 h-4" />
                    <span>Comunicado oficial</span>
                  </div>
                  <DialogTitle className="text-2xl font-semibold text-foreground mt-1">
                    {editingNews ? 'Editar comunicado' : 'Nuevo comunicado'}
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground text-sm font-medium">
                    {editingNews 
                      ? 'Actualiza el texto o recursos visuales de la publicación.' 
                      : 'El anuncio se mostrará inmediatamente a todos los residentes.'
                    }
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-5 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="news-titulo-del-anuncio" className="text-xs font-semibold text-foreground">
                      Título del Anuncio *
                    </Label>
                    <Input id="news-titulo-del-anuncio"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="Ej: Convocatoria Asamblea Ordinaria 2026"
                      required
                      className="h-12"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="news-cuerpo-del-comunicado" className="text-xs font-semibold text-foreground">
                      Cuerpo del Comunicado *
                    </Label>
                    <Textarea id="news-cuerpo-del-comunicado"
                      value={formData.content}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      placeholder="Escribe los detalles, fechas e indicaciones para los residentes…"
                      rows={6}
                      required
                      className="border border-border/80 rounded-xl bg-background font-medium resize-none min-h-[140px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="news-enlace-de-imagen-opcional" className="text-xs font-semibold text-foreground">
                      Enlace de imagen (opcional)
                    </Label>
                    <Input id="news-enlace-de-imagen-opcional"
                      type="url"
                      value={formData.image_url}
                      onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                      placeholder="https://images.unsplash.com/..."
                      className="h-12"
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
                      ) : editingNews ? (
                        'Guardar cambios'
                      ) : (
                        'Publicar comunicado'
                      )}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* News Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-2xl bg-card shadow-hairline">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
            <p className="text-xs font-medium text-muted-foreground">Cargando circulares oficiales...</p>
          </div>
        ) : news.length === 0 ? (
          <div className="border border-dashed border-border/80 rounded-2xl p-12 text-center bg-card">
            <div className="w-16 h-16 bg-muted rounded-2xl border border-border/70 flex items-center justify-center mx-auto mb-4">
              <Newspaper className="w-8 h-8 text-muted-foreground/60" />
            </div>
            <h3 className="font-semibold text-lg text-foreground">No hay publicaciones vigentes</h3>
            <p className="text-muted-foreground text-sm font-medium mt-1 max-w-md mx-auto">
              {isAdmin 
                ? 'Pulsa "Publicar comunicado" para enviar el primero a la comunidad.'
                : 'La administración publicará aquí circulares de interés general para todos los propietarios.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {news.map((item, index) => (
              <div 
                key={item.id} 
                className={`rounded-2xl bg-card overflow-hidden transition-[color,background-color,border-color,box-shadow,opacity,transform] flex flex-col md:flex-row shadow-hairline ${
                  index === 0 ? 'ring-2 ring-primary/20' : ''
                }`}
              >
                {item.image_url && (
                  <div className="md:w-72 lg:w-96 h-56 md:h-auto overflow-hidden bg-muted flex-shrink-0 border-b md:border-b-0 md:border-r border-border/70 relative">
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                    {index === 0 && (
                      <span className="absolute top-3 left-3 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full shadow-md">
                        Prioritario
                      </span>
                    )}
                  </div>
                )}

                <div className="p-6 sm:p-8 flex-1 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                        <Calendar className="w-3.5 h-3.5" />
                        <span className="capitalize">{format(new Date(item.created_at), "EEEE d 'de' MMMM, yyyy", { locale: es })}</span>
                      </div>

                      {isAdmin && (
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(item)}
                            className="h-8 px-3 rounded-lg border text-xs font-semibold gap-1.5"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Editar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 text-xs font-semibold gap-1.5"
                            onClick={() => handleDelete(item.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Eliminar
                          </Button>
                        </div>
                      )}
                    </div>

                    <h2 className="text-xl sm:text-2xl font-semibold text-foreground leading-tight tracking-tight">
                      {item.title}
                    </h2>

                    <p className="text-sm sm:text-base text-foreground/85 font-medium leading-relaxed whitespace-pre-wrap">
                      {item.content}
                    </p>
                  </div>

                  <div className="pt-6 mt-6 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground font-medium">
                    <span>Publicado por la administración</span>
                    <span className="font-mono text-xs">Ref: {item.id.slice(0, 8).toUpperCase()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default News;
