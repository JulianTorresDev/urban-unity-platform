import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Newspaper, Plus, Edit2, Trash2, Loader2, Calendar } from 'lucide-react';
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
    const { data, error } = await supabase
      .from('news')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      toast.error('Error al cargar noticias');
    } else {
      setNews(data || []);
    }
    setLoading(false);
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

    if (editingNews) {
      const { error } = await supabase
        .from('news')
        .update({
          title: formData.title,
          content: formData.content,
          image_url: formData.image_url || null,
        })
        .eq('id', editingNews.id);

      if (error) {
        toast.error('Error al actualizar noticia');
      } else {
        toast.success('Noticia actualizada con éxito');
        fetchNews();
      }
    } else {
      const { error } = await supabase
        .from('news')
        .insert({
          title: formData.title,
          content: formData.content,
          image_url: formData.image_url || null,
          author_id: user?.id,
        });

      if (error) {
        toast.error('Error al crear noticia');
      } else {
        toast.success('Noticia creada con éxito');
        fetchNews();
      }
    }

    setIsSubmitting(false);
    setIsDialogOpen(false);
    setEditingNews(null);
    setFormData({ title: '', content: '', image_url: '' });
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
    if (!confirm('¿Estás seguro de que deseas eliminar esta noticia?')) return;

    const { error } = await supabase.from('news').delete().eq('id', id);
    if (error) {
      toast.error('Error al eliminar noticia');
    } else {
      toast.success('Noticia eliminada con éxito');
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
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <h1 className="font-display text-3xl font-black flex items-center gap-3 text-foreground tracking-tight">
              <Newspaper className="w-8 h-8 text-primary" />
              Noticias
            </h1>
            <p className="text-muted-foreground mt-1 text-sm font-medium">
              {isAdmin ? 'Gestiona los comunicados para tus residentes' : 'Mantente al tanto de las últimas novedades'}
            </p>
          </div>
          {isAdmin && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openCreateDialog} className="gap-2 rounded-2xl px-8 h-12 shadow-lg w-full sm:w-auto">
                  <Plus className="w-4 h-4" />
                  Publicar Noticia
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg rounded-2xl">
                <DialogHeader>
                  <DialogTitle>{editingNews ? 'Editar Noticia' : 'Nueva Noticia'}</DialogTitle>
                  <DialogDescription>
                    {editingNews ? 'Actualiza este comunicado' : 'Crea un nuevo comunicado para los residentes'}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Título *</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="Título del anuncio"
                      required
                      className="h-12 bg-muted/30 border-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="content">Contenido *</Label>
                    <Textarea
                      id="content"
                      value={formData.content}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      placeholder="Escribe el comunicado aquí..."
                      rows={5}
                      required
                      className="bg-muted/30 border-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="image_url">URL de Imagen (opcional)</Label>
                    <Input
                      id="image_url"
                      type="url"
                      value={formData.image_url}
                      onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                      placeholder="https://ejemplo.com/imagen.jpg"
                      className="h-12 bg-muted/30 border-none"
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="rounded-full">
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={isSubmitting} className="rounded-full px-8 shadow-lg">
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Guardando...
                        </>
                      ) : editingNews ? (
                        'Actualizar'
                      ) : (
                        'Publicar'
                      )}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* News List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : news.length === 0 ? (
          <Card className="card-elevated border-none shadow-xl">
            <CardContent className="py-12 text-center">
              <Newspaper className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-lg">No hay noticias publicadas</h3>
              <p className="text-muted-foreground">
                {isAdmin ? 'Crea tu primera noticia para mantener informados a los residentes.' : 'Vuelve más tarde para ver actualizaciones.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-8">
            {news.map((item) => (
              <Card key={item.id} className="card-elevated border-none shadow-xl overflow-hidden animate-fade-in group hover:shadow-2xl transition-all duration-300">
                <div className="flex flex-col md:flex-row">
                  {item.image_url && (
                    <div className="md:w-80 h-64 md:h-auto overflow-hidden">
                      <img
                        src={item.image_url}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <CardTitle className="text-xl lg:text-2xl font-black text-foreground group-hover:text-primary transition-colors">{item.title}</CardTitle>
                          <CardDescription className="flex items-center gap-2 font-bold text-primary text-xs lg:text-sm">
                            <Calendar className="w-3.5 h-3.5" />
                            {format(new Date(item.created_at), "d 'de' MMMM, yyyy", { locale: es })}
                          </CardDescription>
                        </div>
                        {isAdmin && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(item)}
                              className="rounded-full hover:bg-primary/10 w-9 h-9"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full w-9 h-9"
                              onClick={() => handleDelete(item.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-2 lg:pt-4">
                      <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed text-sm lg:text-lg font-medium">{item.content}</p>
                    </CardContent>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default News;
