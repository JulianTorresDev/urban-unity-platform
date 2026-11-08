-- ============================================================
-- MIGRACIÓN: Recibos en 1-Click, Almacenamiento y Personalización Persistente
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Agregar columna receipt_url a dues y payments si no existen
ALTER TABLE public.dues ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE public.dues ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- 2. Asegurar que system_settings permita lectura pública (para pantalla de login) y actualización por admins
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public view system_settings" ON public.system_settings;
CREATE POLICY "Public view system_settings" 
  ON public.system_settings FOR SELECT 
  TO public 
  USING (true);

DROP POLICY IF EXISTS "Admins manage system_settings" ON public.system_settings;
CREATE POLICY "Admins manage system_settings" 
  ON public.system_settings FOR ALL 
  TO authenticated 
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 3. Crear Storage Buckets para 'receipts' (comprobantes) y 'logos'
INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', true) 
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('logos', 'logos', true) 
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas de Storage para Receipts (Comprobantes)
DROP POLICY IF EXISTS "Public read receipts" ON storage.objects;
CREATE POLICY "Public read receipts" 
  ON storage.objects FOR SELECT 
  TO authenticated 
  USING (bucket_id = 'receipts');

DROP POLICY IF EXISTS "Auth upload receipts" ON storage.objects;
CREATE POLICY "Auth upload receipts" 
  ON storage.objects FOR INSERT 
  TO authenticated 
  WITH CHECK (bucket_id = 'receipts');

-- Políticas de Storage para Logos
DROP POLICY IF EXISTS "Public read logos" ON storage.objects;
CREATE POLICY "Public read logos" 
  ON storage.objects FOR SELECT 
  TO public 
  USING (bucket_id = 'logos');

DROP POLICY IF EXISTS "Admins upload logos" ON storage.objects;
CREATE POLICY "Admins upload logos" 
  ON storage.objects FOR INSERT 
  TO authenticated 
  WITH CHECK (bucket_id = 'logos' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins update logos" ON storage.objects;
CREATE POLICY "Admins update logos" 
  ON storage.objects FOR UPDATE 
  TO authenticated 
  USING (bucket_id = 'logos' AND public.is_admin(auth.uid()));

-- 4. Habilitar Realtime para system_settings y dues
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'system_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.system_settings;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dues'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dues;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
  END IF;
END $$;

-- 5. Permitir que los residentes actualicen el campo receipt_url en sus propias alícuotas
DROP POLICY IF EXISTS "Users update own dues receipt" ON public.dues;
CREATE POLICY "Users update own dues receipt" 
  ON public.dues FOR UPDATE 
  TO authenticated 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own payments receipt" ON public.payments;
CREATE POLICY "Users update own payments receipt" 
  ON public.payments FOR UPDATE 
  TO authenticated 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Recargar schema de PostgREST
NOTIFY pgrst, 'reload schema';
