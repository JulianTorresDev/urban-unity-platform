import { useEffect, useState, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageCircle, Send, Loader2, User, Image as ImageIcon, X, ShieldCheck, Users } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchPublicProfiles } from '@/lib/profileDirectory';

interface ChatMessage {
  id: string;
  sender_id: string;
  content: string;
  image_url?: string | null;
  created_at: string;
  isOptimistic?: boolean;
  profiles?: {
    full_name: string | null;
    email: string;
    apartment_number?: string | null;
  };
}

const Chat = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(100);

    // Los perfiles de otros vecinos son privados: nombre y unidad vienen del directorio mínimo
    const rows = data ?? [];
    const directory = await fetchPublicProfiles(rows.map((m) => m.sender_id));
    const result: ChatMessage[] = rows.map((m) => {
      const p = directory.get(m.sender_id);
      return { ...m, profiles: p ? { full_name: p.full_name, email: '', apartment_number: p.apartment_number } : undefined };
    });

    setMessages(result);
    setLoading(false);
    setTimeout(() => scrollToBottom('auto'), 100);
  };

  useEffect(() => {
    fetchMessages();

    channelRef.current = supabase
      .channel('chat-messages-global')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        async (payload) => {
          const newMsg = payload.new as ChatMessage;
          
          setMessages((prev) => {
            const exists = prev.find(m => m.id === newMsg.id);
            if (exists) return prev;

            const fetchProfile = async () => {
              const p = (await fetchPublicProfiles([newMsg.sender_id])).get(newMsg.sender_id);
              const profile = p ? { full_name: p.full_name, email: '', apartment_number: p.apartment_number } : undefined;

              setMessages(current => current.map(m =>
                m.id === newMsg.id ? { ...m, profiles: profile } : m
              ));
            };
            
            fetchProfile();
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Solo se pueden adjuntar imágenes');
        e.target.value = '';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('La imagen no debe superar los 5MB');
        return;
      }
      setSelectedImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const removeSelectedImage = () => {
    setSelectedImage(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if ((!newMessage.trim() && !selectedImage) || !user) return;

    const messageContent = newMessage.trim();
    const tempId = crypto.randomUUID();
    const currentImage = selectedImage;
    const currentPreview = imagePreview;
    
    // Optimistic Update
    const optimisticMsg: ChatMessage = {
      id: tempId,
      sender_id: user.id,
      content: messageContent,
      image_url: currentPreview,
      created_at: new Date().toISOString(),
      isOptimistic: true,
      profiles: {
        full_name: 'Tú',
        email: ''
      }
    };

    setMessages(prev => [...prev, optimisticMsg]);
    setNewMessage('');
    // La vista previa se libera al terminar: el mensaje optimista todavía la muestra
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSending(true);

    let imageUrl = null;

    if (currentImage) {
      const fileExt = currentImage.name.split('.').pop();
      // Cada residente sube en su propia carpeta (lo exige la política del bucket)
      const fileName = `${user.id}/${tempId}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('chat_images')
        .upload(fileName, currentImage);

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage
          .from('chat_images')
          .getPublicUrl(fileName);
        imageUrl = publicUrl;
      } else {
        console.error('Upload error:', uploadError);
        toast.error('Error al subir la imagen');
        // Sin foto ni texto no hay nada que enviar
        if (!messageContent) {
          setMessages(prev => prev.filter(m => m.id !== tempId));
          if (currentPreview) URL.revokeObjectURL(currentPreview);
          setSending(false);
          return;
        }
      }
    }

    const { error, data } = await supabase.from('chat_messages').insert({
      sender_id: user.id,
      content: messageContent,
      image_url: imageUrl,
    }).select().single();

    if (error) {
      toast.error('Error al enviar el mensaje');
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } else if (data) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...data, profiles: { full_name: 'Tú', email: '' } } : m));
    }

    if (currentPreview) URL.revokeObjectURL(currentPreview);
    setSending(false);
  };

  const formatDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return 'Hoy';
    if (isYesterday(date)) return 'Ayer';
    return format(date, "EEEE d 'de' MMMM", { locale: es });
  };

  const groupedMessages: Record<string, ChatMessage[]> = {};
  messages.forEach(msg => {
    const label = formatDateLabel(msg.created_at);
    if (!groupedMessages[label]) groupedMessages[label] = [];
    groupedMessages[label].push(msg);
  });

  return (
    <DashboardLayout>
      <div className="h-[calc(100dvh-6.5rem)] sm:h-[calc(100dvh-7.5rem)] lg:h-[calc(100dvh-9rem)] flex flex-col max-w-5xl mx-auto space-y-4">
        {/* Chat Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-foreground/80 font-medium">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-foreground">Chat de vecinos</h1>
                <span className="w-2.5 h-2.5 rounded-full bg-success" />
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                Avisos y conversación entre vecinos, con respeto.
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-xl border border-border/60">
            <Users className="w-3.5 h-3.5 text-primary" />
            <span>{messages.length} mensajes en hilo</span>
          </div>
        </div>

        {/* Chat Box Container */}
        <div className="flex-1 min-h-0 rounded-2xl bg-card flex flex-col overflow-hidden shadow-hairline">
          {/* Scrollable messages area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="text-xs font-semibold">Cargando mensajes...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="w-16 h-16 rounded-2xl bg-muted border border-border/70 flex items-center justify-center mb-3">
                  <MessageCircle className="w-8 h-8 text-muted-foreground/60" />
                </div>
                <h3 className="font-semibold text-base text-foreground">Aún no hay mensajes</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Sé el primero en saludar a tus vecinos o compartir información de interés.
                </p>
              </div>
            ) : (
              Object.entries(groupedMessages).map(([date, msgs]) => (
                <div key={date} className="space-y-4">
                  {/* Date separator pill */}
                  <div className="flex justify-center">
                    <span className="px-3.5 py-1 rounded-full bg-muted border border-border text-xs font-medium text-muted-foreground">
                      {date}
                    </span>
                  </div>

                  {/* Messages */}
                  <div className="space-y-3">
                    {msgs.map((message) => {
                      const isOwn = message.sender_id === user?.id;
                      return (
                        <div
                          key={message.id}
                          className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[75%]`}>
                            {!isOwn && (
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-primary mb-1 ml-1">
                                <span>{message.profiles?.full_name || 'Vecino'}</span>
                                {message.profiles?.apartment_number && (
                                  <span className="text-muted-foreground font-semibold">
                                    (Apto {message.profiles.apartment_number})
                                  </span>
                                )}
                              </div>
                            )}

                            <div
                              className={`p-4 rounded-2xl text-sm font-semibold leading-relaxed shadow-xs ${
                                isOwn
                                  ? 'bg-action text-action-foreground rounded-br-xs'
                                  : 'bg-background text-foreground border border-border/80 rounded-bl-xs'
                              } ${message.isOptimistic ? 'opacity-70' : ''}`}
                            >
                              {message.image_url && (
                                <div className="mb-2">
                                  <img 
                                    src={message.image_url} 
                                    alt="Adjunto" 
                                    className="rounded-xl max-w-full max-h-60 object-cover cursor-pointer hover:opacity-95 border border-border"
                                    onClick={() => window.open(message.image_url!, '_blank')}
                                  />
                                </div>
                              )}

                              {message.content && (
                                <p className="whitespace-pre-wrap">{message.content}</p>
                              )}

                              <div className={`text-xs font-semibold mt-1.5 flex justify-end ${
                                isOwn ? 'text-action-foreground/75' : 'text-muted-foreground'
                              }`}>
                                {format(new Date(message.created_at), 'hh:mm a')}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Bar */}
          <div className="p-3 sm:p-4 bg-muted/30 border-t border-border/70 flex-shrink-0">
            {imagePreview && (
              <div className="mb-3 relative inline-block">
                <img 
                  src={imagePreview} 
                  className="h-24 w-24 object-cover rounded-xl border border-primary shadow-sm" 
                  alt="Vista previa" 
                />
                <button 
                  type="button"
                  onClick={removeSelectedImage}
                  className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 shadow-md"
                  title="Quitar imagen"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <form onSubmit={handleSend} className="flex items-center gap-2 sm:gap-3">
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                ref={fileInputRef} 
                onChange={handleFileSelect}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl border border-border/80 bg-background text-muted-foreground hover:text-foreground flex-shrink-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || loading}
                title="Adjuntar foto"
                aria-label="Adjuntar foto"
              >
                <ImageIcon className="w-5 h-5 sm:w-6 sm:h-6" />
              </Button>
              
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Escribe tu mensaje para la comunidad..."
                aria-label="Mensaje para la comunidad"
                maxLength={2000}
                className="h-12 sm:h-14 rounded-xl border border-border/80 bg-background px-4 font-semibold text-sm sm:text-base focus-visible:ring-primary flex-1"
                disabled={loading}
              />

              <Button 
                type="submit" 
                disabled={sending || (!newMessage.trim() && !selectedImage) || loading} 
                className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl font-semibold p-0 shadow-sm flex-shrink-0"
                title="Enviar mensaje"
                aria-label="Enviar mensaje"
              >
                {sending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5 sm:w-6 sm:h-6" />
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Chat;
