-- Add image_url to chat_messages
ALTER TABLE public.chat_messages ADD COLUMN image_url TEXT;

-- Fix relationship between chat_messages and profiles
-- First, drop the old constraint if it exists (it points to auth.users)
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_sender_id_fkey;

-- Add the new constraint pointing to public.profiles
ALTER TABLE public.chat_messages 
ADD CONSTRAINT chat_messages_sender_id_fkey 
FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Create chat_images bucket if not exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('chat_images', 'chat_images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for chat_images
CREATE POLICY "Public can view chat images" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'chat_images');

CREATE POLICY "Users can upload chat images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat_images');
