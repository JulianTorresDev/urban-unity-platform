-- ============================================================
-- URBAN UNITY — MIGRACIÓN CONSOLIDADA IDEMPOTENTE
-- Ejecutar en Supabase SQL Editor → presionar RUN
-- Versión: 2026-05-13
-- ============================================================

-- =====================
-- 1. SYSTEM_SETTINGS
-- =====================
CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT 'Urban Unity',
  logo_url TEXT,
  primary_color TEXT DEFAULT '#3b82f6',
  secondary_color TEXT DEFAULT '#1e293b',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.system_settings (company_name)
SELECT 'Urban Unity'
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view settings" ON public.system_settings;
CREATE POLICY "Authenticated can view settings" ON public.system_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage settings" ON public.system_settings
;
CREATE POLICY "Admins can manage settings" ON public.system_settings
  FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- =====================
-- 2. CHAT MESSAGES FIX
-- =====================
-- Add image_url column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chat_messages'
      AND column_name = 'image_url'
  ) THEN
    ALTER TABLE public.chat_messages ADD COLUMN image_url TEXT;
  END IF;
END $$;

-- Fix FK: point sender_id to profiles instead of auth.users
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_sender_id_fkey;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- =====================
-- 3. ACCESS TOKENS
-- =====================

CREATE TABLE IF NOT EXISTS public.access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  domicile_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('permanent', 'temporary')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'access_tokens_user_id_fkey'
      AND table_name = 'access_tokens'
  ) THEN
    ALTER TABLE public.access_tokens
      ADD CONSTRAINT access_tokens_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.access_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own tokens" ON public.access_tokens;
CREATE POLICY "Users view own tokens" ON public.access_tokens
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users create own tokens" ON public.access_tokens;
CREATE POLICY "Users create own tokens" ON public.access_tokens
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own tokens" ON public.access_tokens;
CREATE POLICY "Users update own tokens" ON public.access_tokens
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage all tokens" ON public.access_tokens;
CREATE POLICY "Admins manage all tokens" ON public.access_tokens
  FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- =====================
-- 4. KUSHKI TRANSACTIONS
-- =====================
CREATE TABLE IF NOT EXISTS public.kushki_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  transaction_token TEXT,
  amount DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL,
  response_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.kushki_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own transactions" ON public.kushki_transactions;
CREATE POLICY "Users view own transactions" ON public.kushki_transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all transactions" ON public.kushki_transactions;
CREATE POLICY "Admins view all transactions" ON public.kushki_transactions
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- =====================
-- 5. STORAGE (Chat Images)
-- =====================
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat_images', 'chat_images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Auth view chat images" ON storage.objects;
CREATE POLICY "Auth view chat images" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'chat_images');

DROP POLICY IF EXISTS "Auth upload chat images" ON storage.objects;
CREATE POLICY "Auth upload chat images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat_images');

-- =====================
-- 6. REFRESH POSTGREST CACHE
-- =====================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- FIN — Si ves "Success" todo está listo.
-- ============================================================
