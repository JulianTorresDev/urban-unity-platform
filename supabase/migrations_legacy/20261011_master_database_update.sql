-- ============================================================
-- URBAN UNITY PLATFORM — ACTUALIZACIÓN MAESTRA DE BASE DE DATOS
-- Ejecutar en Supabase SQL Editor → Presionar RUN
-- Este script es 100% IDEMPOTENTE: no borra datos y se puede ejecutar múltiples veces.
-- ============================================================

-- 1. TIPOS / ENUMS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'resident');
  END IF;
END $$;

-- 2. TABLA: PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  apartment_number TEXT,
  phone TEXT,
  apartment_type_id UUID,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  nfc_card_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agregar columnas faltantes en profiles si ya existía la tabla
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nfc_card_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS apartment_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS apartment_type_id UUID;

-- 3. TABLA: USER_ROLES
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'resident',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- 4. TABLA: TIPOS DE APARTAMENTO (Alícuotas)
CREATE TABLE IF NOT EXISTS public.apartment_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  monthly_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK de profiles -> apartment_types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'profiles_apartment_type_id_fkey') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_apartment_type_id_fkey
      FOREIGN KEY (apartment_type_id) REFERENCES public.apartment_types(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. TABLA: NOTICIAS
CREATE TABLE IF NOT EXISTS public.news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. TABLA: PAGOS
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('monthly_dues', 'fine', 'other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. TABLA: ALÍCUOTAS (DUES)
CREATE TABLE IF NOT EXISTS public.dues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  apartment_type_id UUID REFERENCES public.apartment_types(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. TABLA: RECURSOS RESERVABLES
CREATE TABLE IF NOT EXISTS public.resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  max_hours_per_booking INTEGER DEFAULT 4,
  available_from TIME DEFAULT '08:00',
  available_until TIME DEFAULT '22:00',
  base_price DECIMAL(10,2) DEFAULT 0,
  price_per_hour DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. TABLA: RESERVAS
CREATE TABLE IF NOT EXISTS public.reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID REFERENCES public.resources(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled')),
  notes TEXT,
  price DECIMAL(10,2),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. TABLA: TICKETS / PQR
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('suggestion', 'complaint', 'maintenance', 'other')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. TABLA: CHAT COMUNITARIO
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chat_messages_sender_id_fkey') THEN
    ALTER TABLE public.chat_messages
      ADD CONSTRAINT chat_messages_sender_id_fkey
      FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 12. TABLA: CONFIGURACIÓN DEL SISTEMA (Personalización de Marca)
CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT 'Urban Unity',
  logo_url TEXT,
  primary_color TEXT DEFAULT '#3b82f6',
  secondary_color TEXT DEFAULT '#1e293b',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. TABLA: TOKENS DE ACCESO QR (Fijos / Permanentes)
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
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'access_tokens_user_id_fkey') THEN
    ALTER TABLE public.access_tokens
      ADD CONSTRAINT access_tokens_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 14. TABLA: CÓDIGOS DE ACCESO PARA VISITANTES (Access Codes)
CREATE TABLE IF NOT EXISTS public.access_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'resident' CHECK (type IN ('resident', 'visitor')),
  visitor_name TEXT,
  visitor_document TEXT,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 15. TABLA: REGISTROS DE INGRESO / SALIDA (Access Logs)
CREATE TABLE IF NOT EXISTS public.access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_code_id UUID REFERENCES public.access_codes(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('entry', 'exit')),
  scanned_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 16. TABLA: NOTIFICACIONES
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id) WHERE is_read = false;

-- =====================
-- FUNCIONES DE ROL
-- =====================

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'super_admin')
  )
$$;

-- Trigger para nuevo usuario registrado
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, status)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'full_name', 'Residente'), 'active')
  ON CONFLICT (id) DO NOTHING;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'resident')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================
-- ROW LEVEL SECURITY (RLS)
-- =====================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apartment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Políticas de Profiles
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
CREATE POLICY "Admins view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins manage profiles" ON public.profiles;
CREATE POLICY "Admins manage profiles" ON public.profiles FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Políticas de Roles
DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Políticas de News
DROP POLICY IF EXISTS "Anyone view news" ON public.news;
CREATE POLICY "Anyone view news" ON public.news FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage news" ON public.news;
CREATE POLICY "Admins manage news" ON public.news FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Políticas de System Settings
DROP POLICY IF EXISTS "Authenticated view settings" ON public.system_settings;
CREATE POLICY "Authenticated view settings" ON public.system_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage settings" ON public.system_settings;
CREATE POLICY "Admins manage settings" ON public.system_settings FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Políticas de Access Tokens (QR fijo)
DROP POLICY IF EXISTS "Users view own tokens" ON public.access_tokens;
CREATE POLICY "Users view own tokens" ON public.access_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage tokens" ON public.access_tokens;
CREATE POLICY "Admins manage tokens" ON public.access_tokens FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Políticas de Chat
DROP POLICY IF EXISTS "Anyone view chat" ON public.chat_messages;
CREATE POLICY "Anyone view chat" ON public.chat_messages FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users send chat" ON public.chat_messages;
CREATE POLICY "Users send chat" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

-- Políticas de Notificaciones
DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
CREATE POLICY "Users view own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage all notifications" ON public.notifications;
CREATE POLICY "Admins manage all notifications" ON public.notifications FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "System insert notifications" ON public.notifications;
CREATE POLICY "System insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- Políticas de Reservas y Recursos
DROP POLICY IF EXISTS "Anyone view resources" ON public.resources;
CREATE POLICY "Anyone view resources" ON public.resources FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage resources" ON public.resources;
CREATE POLICY "Admins manage resources" ON public.resources FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users view all reservations" ON public.reservations;
CREATE POLICY "Users view all reservations" ON public.reservations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users create own reservations" ON public.reservations;
CREATE POLICY "Users create own reservations" ON public.reservations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage reservations" ON public.reservations;
CREATE POLICY "Admins manage reservations" ON public.reservations FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Políticas de Tickets / PQR
DROP POLICY IF EXISTS "Users view own tickets" ON public.tickets;
CREATE POLICY "Users view own tickets" ON public.tickets FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all tickets" ON public.tickets;
CREATE POLICY "Admins view all tickets" ON public.tickets FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users create tickets" ON public.tickets;
CREATE POLICY "Users create tickets" ON public.tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Políticas de Pagos y Alícuotas
DROP POLICY IF EXISTS "Users view own payments" ON public.payments;
CREATE POLICY "Users view own payments" ON public.payments FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage payments" ON public.payments;
CREATE POLICY "Admins manage payments" ON public.payments FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users view own dues" ON public.dues;
CREATE POLICY "Users view own dues" ON public.dues FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage dues" ON public.dues;
CREATE POLICY "Admins manage dues" ON public.dues FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- =====================
-- REALTIME
-- =====================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- =====================
-- STORAGE BUCKETS
-- =====================
INSERT INTO storage.buckets (id, name, public) VALUES ('chat_images', 'chat_images', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public access chat images" ON storage.objects;
CREATE POLICY "Public access chat images" ON storage.objects FOR SELECT TO authenticated USING (bucket_id IN ('chat_images', 'logos'));

DROP POLICY IF EXISTS "Upload chat images" ON storage.objects;
CREATE POLICY "Upload chat images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('chat_images', 'logos'));

-- =====================
-- DATOS INICIALES POR DEFECTO
-- =====================

-- Configuración inicial si está vacía
INSERT INTO public.system_settings (company_name, primary_color, secondary_color)
SELECT 'Gestor Residencial — Gissel''s 2', '#1168bd', '#1e293b'
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings);

-- Actualizar si tenía el nombre por defecto anterior
UPDATE public.system_settings 
SET company_name = 'Gestor Residencial — Gissel''s 2' 
WHERE company_name = 'Urban Unity';

-- Tipos de apartamento base si está vacía
INSERT INTO public.apartment_types (name, monthly_fee, description)
SELECT 'Estándar 2 Habitaciones', 50.00, 'Alícuota base para unidades de 2 habitaciones'
WHERE NOT EXISTS (SELECT 1 FROM public.apartment_types);

-- Recursos básicos si está vacía
INSERT INTO public.resources (name, description, max_hours_per_booking, base_price)
SELECT 'Salón Social', 'Espacio cerrado para reuniones y eventos privados', 4, 25.00
WHERE NOT EXISTS (SELECT 1 FROM public.resources WHERE name = 'Salón Social');

INSERT INTO public.resources (name, description, max_hours_per_booking, base_price)
SELECT 'Áreas Húmedas / Piscina', 'Zona de piscina y descanso', 3, 0.00
WHERE NOT EXISTS (SELECT 1 FROM public.resources WHERE name = 'Áreas Húmedas / Piscina');

-- =====================
-- AUTO-CONFIRMAR CORREOS EXISTENTES Y ASIGNAR SUPER ADMIN
-- =====================
UPDATE auth.users SET email_confirmed_at = now() WHERE email_confirmed_at IS NULL;

-- Asignar Super Admin al primer usuario registrado
UPDATE public.user_roles 
SET role = 'super_admin' 
WHERE user_id = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1);

-- Recargar caché del schema
NOTIFY pgrst, 'reload schema';
