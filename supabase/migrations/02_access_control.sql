-- ============================================================
-- MIGRACIÓN: Control de Acceso + Bloqueo de Morosos
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Agregar estado (activo/bloqueado) a perfiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Agregar constraint si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'profiles_status_check'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check
      CHECK (status IN ('active', 'blocked'));
  END IF;
END $$;

-- 2. Agregar campo para tarjeta NFC/Proximidad
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nfc_card_id TEXT;

-- 3. Refrescar caché
NOTIFY pgrst, 'reload schema';
