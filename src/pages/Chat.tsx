import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageCircle, Send, Loader2, User, Image as ImageIcon, X } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

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
  const channelRef = useRef<any>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const fetchMessages = async () => {
    let result: any[] = [];

    // Try with profiles join first
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*, profiles(full_name, email)')
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) {
      // Fallback: if FK doesn't exist yet, fetch without the join
      console.warn('Chat FK fallback: loading messages without profile names');
      const { data: fallbackData } = await supabase
        .from('chat_messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(100);
      result = fallbackData || [];
    } else {
      result = data || [];
    }

    setMessages(result as ChatMessage[]);
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
          const newMsg = payload.new as any;
          
          setMessages((prev) => {
            const exists = prev.find(m => m.id === newMsg.id);
            if (exists) return prev;

            const fetchProfile = async () => {
              const { data: profile } = await supabase
                .from('profiles')
                .select('full_name, email')
                .eq('id', newMsg.sender_id)
                .single();
              
              setMessages(current => current.map(m => 
                m.id === newMsg.id ? { ...m, profiles: profile || undefined } : m
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
        full_name: 'Enviando...',
        email: ''
      }
    };

    setMessages(prev => [...prev, optimisticMsg]);
    setNewMessage('');
    removeSelectedImage();
    setSending(true);

    let imageUrl = null;

    // Upload image if exists
    if (currentImage) {
      const fileExt = currentImage.name.split('.').pop();
      const fileName = `${tempId}.${fileExt}`;
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
      }
    }

    const { error, data } = await supabase.from('chat_messages').insert({
      sender_id: user.id,
      content: messageContent,
      image_url: imageUrl,
    } as any).select().single();

    if (error) {
      toast.error('Error al enviar el mensaje');
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } else if (data) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...data, profiles: { full_name: 'Tú', email: '' } } : m));
    }

    setSending(false);
  };

  const formatDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return 'Hoy';
    if (isYesterday(date)) return 'Ayer';
    return format(date, "d 'de' MMMM", { locale: es });
  };

  const groupedMessages: Record<string, ChatMessage[]> = {};
  messages.forEach(msg => {
    const label = formatDateLabel(msg.created_at);
    if (!groupedMessages[label]) groupedMessages[label] = [];
    groupedMessages[label].push(msg);
  });

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-5rem)] lg:h-[calc(100vh-10rem)] flex flex-col max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-4 lg:mb-6 flex items-center justify-between px-1">
          <div>
            <h1 className="font-display text-2xl lg:text-3xl font-black flex items-center gap-3 text-foreground tracking-tight">
              <MessageCircle className="w-6 h-6 lg:w-8 lg:h-8 text-primary animate-pulse" />
              Chat
            </h1>
            <p className="text-muted-foreground text-xs lg:text-sm font-medium">
              Canal de la comunidad
            </p>
          </div>
          <div className="hidden sm:flex -space-x-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="w-10 h-10 rounded-full border-2 border-background bg-muted flex items-center justify-center overflow-hidden">
                <User className="w-5 h-5 text-muted-foreground" />
              </div>
            ))}
          </div>
        </div>

        {/* Chat Container */}
        <Card className="card-elevated flex-1 flex flex-col overflow-hidden border-none shadow-2xl bg-card/40 backdrop-blur-xl relative">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
          
          <CardHeader className="border-b border-border/50 bg-background/50 backdrop-blur-md z-10 py-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Canal General
                </CardTitle>
                <CardDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
                  {messages.length} Mensajes Registrados
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="flex-1 overflow-hidden p-0 flex flex-col relative z-10">
            <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-custom">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full space-y-4">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Cargando Conversación...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-20">
                  <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <MessageCircle className="w-10 h-10 text-primary opacity-40" />
                  </div>
                  <h3 className="font-black text-2xl text-foreground">El chat está vacío</h3>
                  <p className="text-muted-foreground font-medium mt-2">¡Saluda a tus vecinos!</p>
                </div>
              ) : (
                Object.entries(groupedMessages).map(([date, msgs]) => (
                  <div key={date} className="space-y-6">
                    <div className="flex justify-center">
                      <span className="px-4 py-1 rounded-full bg-muted/80 text-[10px] font-black uppercase tracking-widest text-muted-foreground shadow-sm">
                        {date}
                      </span>
                    </div>
                    
                    <div className="space-y-4">
                      <AnimatePresence initial={false}>
                        {msgs.map((message) => {
                          const isOwn = message.sender_id === user?.id;
                          return (
                            <motion.div
                              key={message.id}
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                            >
                              <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[90%] sm:max-w-[80%]`}>
                                {!isOwn && (
                                  <span className="text-[10px] font-black text-primary uppercase tracking-widest mb-1 ml-2">
                                    {message.profiles?.full_name || 'Vecino'}
                                  </span>
                                )}
                                <div
                                  className={`relative rounded-2xl shadow-sm text-sm font-medium leading-relaxed overflow-hidden ${
                                    isOwn
                                      ? 'bg-primary text-primary-foreground rounded-br-none'
                                      : 'bg-muted/80 backdrop-blur-sm rounded-bl-none text-foreground border border-border/50'
                                  } ${message.isOptimistic ? 'opacity-70 animate-pulse' : ''}`}
                                >
                                  {message.image_url && (
                                    <div className="p-1">
                                      <img 
                                        src={message.image_url} 
                                        alt="Chat content" 
                                        className="rounded-xl max-w-full max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                        onClick={() => window.open(message.image_url!, '_blank')}
                                      />
                                    </div>
                                  )}
                                  {message.content && (
                                    <div className="px-5 py-3">
                                      {message.content}
                                    </div>
                                  )}
                                  <div className={`absolute bottom-[-18px] ${isOwn ? 'right-0' : 'left-0'} text-[9px] font-black text-muted-foreground/50 uppercase tracking-tighter`}>
                                    {format(new Date(message.created_at), 'h:mm a', { locale: es })}
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 lg:p-6 bg-background/50 backdrop-blur-xl border-t border-border/50">
              <AnimatePresence>
                {imagePreview && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mb-4 relative"
                  >
                    <div className="relative inline-block">
                      <img src={imagePreview} className="h-32 w-32 object-cover rounded-2xl border-4 border-primary/20 shadow-lg" alt="Preview" />
                      <button 
                        onClick={removeSelectedImage}
                        className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-1 shadow-lg hover:scale-110 transition-transform"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={handleSend} className="flex gap-4 items-center">
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  ref={fileInputRef} 
                  onChange={handleFileSelect}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-14 w-14 rounded-2xl bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || loading}
                >
                  <ImageIcon className="w-6 h-6" />
                </Button>
                
                <div className="flex-1 relative group">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Escribe un mensaje..."
                    className="h-14 rounded-2xl border-none bg-muted/50 px-6 font-medium text-lg focus-visible:ring-primary/20 transition-all shadow-inner"
                    disabled={loading}
                  />
                </div>
                <Button 
                  type="submit" 
                  disabled={sending || (!newMessage.trim() && !selectedImage) || loading} 
                  className="rounded-2xl h-14 w-14 p-0 shadow-xl shadow-primary/30 hover:scale-105 active:scale-95 transition-all"
                >
                  {sending ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <Send className="w-6 h-6" />
                  )}
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>

      <style>{`
        .scrollbar-custom::-webkit-scrollbar {
          width: 6px;
        }
        .scrollbar-custom::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-custom::-webkit-scrollbar-thumb {
          background: hsl(var(--muted-foreground) / 0.2);
          border-radius: 10px;
        }
        .scrollbar-custom::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--primary) / 0.2);
        }
      `}</style>
    </DashboardLayout>
  );
};

export default Chat;
