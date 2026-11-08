-- ============================================================
-- ESQUEMA INICIAL — Gestor Residencial Gissel's 2
--
-- Única migración del proyecto: crea desde cero tablas, funciones, triggers,
-- políticas RLS, buckets de Storage y realtime. Reemplaza a las migraciones
-- anteriores (archivadas en supabase/migrations_legacy/), que estaban
-- duplicadas, se contradecían o no se podían ejecutar en orden.
-- Los datos iniciales están en supabase/seed.sql.
--
-- Idempotente y en una transacción: si algo falla, la base queda como estaba.
-- Las decisiones de seguridad (S-01 a S-08, F-01 a F-04) están explicadas en
-- docs/INFORME_PRUEBAS.md.
-- ============================================================

BEGIN;

-- ============================================================
-- PARTE A. TABLAS
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
  receipt_url TEXT,
  rejection_reason TEXT,
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
  receipt_url TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
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

-- 17. TABLA: TRANSACCIONES DE KUSHKI (pasarela de pago y su webhook)
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

-- Buckets de Storage
INSERT INTO storage.buckets (id, name, public) VALUES
  ('receipts', 'receipts', true),
  ('chat_images', 'chat_images', true),
  ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- Realtime para el chat y las notificaciones
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

-- ============================================================
-- PARTE B. SEGURIDAD Y REGLAS DE NEGOCIO
-- ============================================================

-- ------------------------------------------------------------
-- 1. Funciones auxiliares
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin')
$$;

-- Usuario con cuenta activa (no suspendida por morosidad)
CREATE OR REPLACE FUNCTION public.is_active_user(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _user_id AND COALESCE(status, 'active') = 'active'
  )
$$;

-- Llamada hecha por un usuario final (no por service_role / SQL editor, donde auth.uid() es NULL)
CREATE OR REPLACE FUNCTION public.is_end_user_request()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid())
$$;

-- ------------------------------------------------------------
-- 2. Eliminar todas las políticas existentes de las tablas de la app
-- ------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN (
      'profiles','user_roles','apartment_types','news','payments','dues','resources',
      'reservations','tickets','chat_messages','system_settings','access_tokens',
      'access_codes','access_logs','notifications','kushki_transactions'
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','user_roles','apartment_types','news','payments','dues','resources',
    'reservations','tickets','chat_messages','system_settings','access_tokens',
    'access_codes','access_logs','notifications'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
  IF to_regclass('public.kushki_transactions') IS NOT NULL THEN
    ALTER TABLE public.kushki_transactions ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3. Políticas por tabla
-- ------------------------------------------------------------

-- PROFILES: cada quien ve y edita lo suyo; la administración ve y gestiona todo
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_select_admin" ON public.profiles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- USER_ROLES: lectura propia y de administración; cambios solo vía set_user_role() o super_admin
CREATE POLICY "roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "roles_select_admin" ON public.user_roles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "roles_super_admin_all" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- APARTMENT_TYPES
CREATE POLICY "apartment_types_select" ON public.apartment_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "apartment_types_admin_all" ON public.apartment_types FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- NEWS
CREATE POLICY "news_select" ON public.news FOR SELECT TO authenticated USING (true);
CREATE POLICY "news_admin_all" ON public.news FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- SYSTEM_SETTINGS: lectura pública (marca en la pantalla de acceso)
CREATE POLICY "settings_select_public" ON public.system_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "settings_admin_all" ON public.system_settings FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- PAYMENTS y DUES: el residente ve lo suyo y solo puede adjuntar comprobante (ver trigger)
CREATE POLICY "payments_select_own" ON public.payments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "payments_update_own_receipt" ON public.payments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "payments_admin_all" ON public.payments FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "dues_select_own" ON public.dues FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "dues_update_own_receipt" ON public.dues FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dues_admin_all" ON public.dues FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- RESOURCES
CREATE POLICY "resources_select" ON public.resources FOR SELECT TO authenticated USING (true);
CREATE POLICY "resources_admin_all" ON public.resources FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- RESERVATIONS: todos ven la ocupación; el residente activo crea y cancela las suyas
CREATE POLICY "reservations_select" ON public.reservations FOR SELECT TO authenticated USING (true);
CREATE POLICY "reservations_insert_own" ON public.reservations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_active_user(auth.uid()));
CREATE POLICY "reservations_cancel_own" ON public.reservations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reservations_admin_all" ON public.reservations FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- TICKETS: el residente crea y ve los suyos (incluso suspendido, para poder reclamar)
CREATE POLICY "tickets_select_own" ON public.tickets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "tickets_insert_own" ON public.tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tickets_admin_all" ON public.tickets FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- CHAT
CREATE POLICY "chat_select" ON public.chat_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "chat_insert_own" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND public.is_active_user(auth.uid()));
CREATE POLICY "chat_admin_all" ON public.chat_messages FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ACCESS_TOKENS (QR permanente): solo lectura para el dueño; los emite la base de datos
CREATE POLICY "tokens_select_own" ON public.access_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "tokens_admin_all" ON public.access_tokens FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ACCESS_CODES y ACCESS_LOGS (pases de visitantes y bitácora)
CREATE POLICY "access_codes_select_own" ON public.access_codes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "access_codes_admin_all" ON public.access_codes FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "access_logs_select_own" ON public.access_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.access_codes c WHERE c.id = access_code_id AND c.user_id = auth.uid()));
CREATE POLICY "access_logs_admin_all" ON public.access_logs FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- NOTIFICATIONS
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notifications_delete_own" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notifications_insert_own" ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notifications_admin_all" ON public.notifications FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- KUSHKI (no usado por la app actual; se deja en solo lectura)
DO $$
BEGIN
  IF to_regclass('public.kushki_transactions') IS NOT NULL THEN
    CREATE POLICY "kushki_select_own" ON public.kushki_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
    CREATE POLICY "kushki_select_admin" ON public.kushki_transactions FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
  END IF;
END $$;

-- ------------------------------------------------------------
-- 4. Protección de columnas: lo que un usuario final puede cambiar
-- ------------------------------------------------------------

-- PROFILES: el residente solo edita su nombre y teléfono
CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.is_end_user_request() AND
     (to_jsonb(NEW) - ARRAY['full_name','phone','updated_at']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['full_name','phone','updated_at']) THEN
    RAISE EXCEPTION 'Solo la administración puede modificar el estado, la unidad o el correo de un perfil'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_update ON public.profiles;
CREATE TRIGGER guard_profile_update BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_update();

-- DUES y PAYMENTS: el residente solo adjunta comprobante y queda "pendiente de revisión"
CREATE OR REPLACE FUNCTION public.guard_receipt_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE allowed TEXT[] := ARRAY['receipt_url','rejection_reason','status','updated_at'];
BEGIN
  IF public.is_end_user_request() THEN
    IF OLD.status = 'paid' THEN
      RAISE EXCEPTION 'Este cobro ya fue verificado y no se puede modificar' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'Solo la administración puede aprobar un pago' USING ERRCODE = '42501';
    END IF;
    IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
      RAISE EXCEPTION 'Solo se puede adjuntar el comprobante de pago' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_dues_update ON public.dues;
CREATE TRIGGER guard_dues_update BEFORE UPDATE ON public.dues
  FOR EACH ROW EXECUTE FUNCTION public.guard_receipt_update();

DROP TRIGGER IF EXISTS guard_payments_update ON public.payments;
CREATE TRIGGER guard_payments_update BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_receipt_update();

-- TICKETS: el residente no puede abrir un ticket ya resuelto ni escribir la respuesta oficial
CREATE OR REPLACE FUNCTION public.guard_ticket_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.is_end_user_request() THEN
    NEW.status := 'open';
    NEW.admin_notes := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_ticket_insert ON public.tickets;
CREATE TRIGGER guard_ticket_insert BEFORE INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.guard_ticket_insert();

-- ------------------------------------------------------------
-- 5. Reservas: reglas de negocio en la base de datos
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_reservation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  res public.resources%ROWTYPE;
  hours NUMERIC;
  local_start TIMESTAMP;
  local_end TIMESTAMP;
BEGIN
  IF NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'La hora de fin debe ser posterior a la de inicio' USING ERRCODE = '22007';
  END IF;

  IF public.is_end_user_request() THEN
    IF TG_OP = 'UPDATE' THEN
      -- El residente solo puede cancelar una reserva vigente
      IF NEW.status <> 'cancelled' OR OLD.status NOT IN ('pending', 'confirmed')
         OR (to_jsonb(NEW) - ARRAY['status']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status']) THEN
        RAISE EXCEPTION 'Solo puedes cancelar tus reservas vigentes' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;

    SELECT * INTO res FROM public.resources WHERE id = NEW.resource_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El área solicitada no existe' USING ERRCODE = '23503';
    END IF;

    IF NEW.start_time <= now() THEN
      RAISE EXCEPTION 'No puedes reservar en un horario pasado' USING ERRCODE = '22007';
    END IF;

    hours := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 3600.0;
    IF res.max_hours_per_booking IS NOT NULL AND hours > res.max_hours_per_booking THEN
      RAISE EXCEPTION 'La reserva supera el máximo de % horas para esta área', res.max_hours_per_booking
        USING ERRCODE = '22023';
    END IF;

    -- Horario hábil del área, en hora de Ecuador
    local_start := NEW.start_time AT TIME ZONE 'America/Guayaquil';
    local_end := NEW.end_time AT TIME ZONE 'America/Guayaquil';
    IF res.available_from IS NOT NULL AND res.available_until IS NOT NULL AND (
         local_start::date <> (local_end - INTERVAL '1 microsecond')::date
         OR local_start::time < res.available_from
         OR local_end::time > res.available_until
         OR (local_end::time = '00:00' AND res.available_until <> '23:59:59')
       ) THEN
      RAISE EXCEPTION 'El área solo se puede reservar entre % y %', res.available_from, res.available_until
        USING ERRCODE = '22023';
    END IF;

    -- El estado y el precio los decide el sistema, no el cliente
    NEW.status := 'pending';
    NEW.rejection_reason := NULL;
    NEW.price := COALESCE(res.base_price, 0) + COALESCE(res.price_per_hour, 0) * hours;
  END IF;

  -- Sin cruces de horario entre reservas vigentes del mismo espacio
  IF NEW.status IN ('pending', 'confirmed') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.resource_id::text, 0));
    IF EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.resource_id = NEW.resource_id
        AND r.id <> NEW.id
        AND r.status IN ('pending', 'confirmed')
        AND tstzrange(r.start_time, r.end_time, '[)') && tstzrange(NEW.start_time, NEW.end_time, '[)')
    ) THEN
      RAISE EXCEPTION 'Este espacio ya se encuentra reservado en ese horario' USING ERRCODE = '23P01';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_reservation ON public.reservations;
CREATE TRIGGER guard_reservation BEFORE INSERT OR UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.guard_reservation();

-- ------------------------------------------------------------
-- 6. Roles: un solo rol por usuario, cambiado de forma atómica y con jerarquía
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_user_role(_target UUID, _role app_role)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE caller UUID := auth.uid();
BEGIN
  IF caller IS NULL OR NOT public.is_admin(caller) THEN
    RAISE EXCEPTION 'Solo la administración puede cambiar roles' USING ERRCODE = '42501';
  END IF;
  IF _target = caller THEN
    RAISE EXCEPTION 'No puedes cambiar tu propio rol' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_super_admin(caller) AND (_role = 'super_admin' OR public.is_super_admin(_target)) THEN
    RAISE EXCEPTION 'Solo un superadministrador puede asignar o modificar ese rol' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _target) THEN
    RAISE EXCEPTION 'El usuario no existe' USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _target;
  INSERT INTO public.user_roles (user_id, role) VALUES (_target, _role);
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_role(UUID, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(UUID, app_role) TO authenticated;

-- Limpia usuarios que quedaron con varios roles: conserva el de mayor jerarquía
DELETE FROM public.user_roles ur
USING public.user_roles keep
WHERE ur.user_id = keep.user_id
  AND ur.id <> keep.id
  AND (CASE keep.role WHEN 'super_admin' THEN 3 WHEN 'admin' THEN 2 ELSE 1 END)
    > (CASE ur.role WHEN 'super_admin' THEN 3 WHEN 'admin' THEN 2 ELSE 1 END);

-- ------------------------------------------------------------
-- 7. Directorio mínimo de perfiles (nombre y unidad) para el chat
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_profiles(_ids UUID[])
RETURNS TABLE (id UUID, full_name TEXT, apartment_number TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.apartment_number
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL AND p.id = ANY(_ids)
$$;

REVOKE ALL ON FUNCTION public.get_public_profiles(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_profiles(UUID[]) TO authenticated;

-- ------------------------------------------------------------
-- 8. Token QR permanente: se emite automáticamente para cada perfil
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_permanent_token()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.access_tokens (user_id, domicile_id, token, type)
  SELECT NEW.id,
         COALESCE(NULLIF(NEW.apartment_number, ''), 'S/N'),
         -- 244 bits aleatorios del generador criptográfico de Postgres
         replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
         'permanent'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.access_tokens t WHERE t.user_id = NEW.id AND t.type = 'permanent'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS issue_permanent_token ON public.profiles;
CREATE TRIGGER issue_permanent_token AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.issue_permanent_token();

-- Mantiene la unidad del token sincronizada con el perfil
CREATE OR REPLACE FUNCTION public.sync_token_domicile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.apartment_number IS DISTINCT FROM OLD.apartment_number THEN
    UPDATE public.access_tokens
    SET domicile_id = COALESCE(NULLIF(NEW.apartment_number, ''), 'S/N')
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_token_domicile ON public.profiles;
CREATE TRIGGER sync_token_domicile AFTER UPDATE OF apartment_number ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_token_domicile();

-- Emite tokens a los perfiles existentes que no tienen uno
INSERT INTO public.access_tokens (user_id, domicile_id, token, type)
SELECT p.id,
       COALESCE(NULLIF(p.apartment_number, ''), 'S/N'),
       replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
       'permanent'
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.access_tokens t WHERE t.user_id = p.id AND t.type = 'permanent');

-- El alta guarda el teléfono enviado al registrar; la unidad la asigna la administración
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), 'Residente'),
    NULLIF(NEW.raw_user_meta_data ->> 'phone', ''),
    'active'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'resident')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 9. Límites de contenido
-- ------------------------------------------------------------
DO $$
BEGIN
  -- Hasta 2000 caracteres; el texto puede ir vacío solo si el mensaje lleva una foto
  ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_content_length;
  ALTER TABLE public.chat_messages
    ADD CONSTRAINT chat_messages_content_length
    CHECK (char_length(content) <= 2000 AND (char_length(btrim(content)) >= 1 OR image_url IS NOT NULL)) NOT VALID;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_text_length') THEN
    ALTER TABLE public.tickets
      ADD CONSTRAINT tickets_text_length
      CHECK (char_length(subject) BETWEEN 1 AND 200 AND char_length(description) BETWEEN 1 AND 5000) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'amounts_non_negative_dues') THEN
    ALTER TABLE public.dues ADD CONSTRAINT amounts_non_negative_dues CHECK (amount >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'amounts_non_negative_payments') THEN
    ALTER TABLE public.payments ADD CONSTRAINT amounts_non_negative_payments CHECK (amount >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apartment_types_fee_non_negative') THEN
    ALTER TABLE public.apartment_types
      ADD CONSTRAINT apartment_types_fee_non_negative CHECK (monthly_fee >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resources_valid_pricing') THEN
    ALTER TABLE public.resources
      ADD CONSTRAINT resources_valid_pricing
      CHECK (COALESCE(base_price, 0) >= 0 AND COALESCE(price_per_hour, 0) >= 0
             AND (max_hours_per_booking IS NULL OR max_hours_per_booking BETWEEN 1 AND 24)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'system_settings_color_hex') THEN
    ALTER TABLE public.system_settings
      ADD CONSTRAINT system_settings_color_hex
      CHECK (primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{6}$') NOT VALID;
  END IF;
END $$;

-- Una sola alícuota por residente y mes (evita doble emisión).
-- Si ya existen duplicados no se crea el índice y se avisa para revisarlos a mano.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.dues GROUP BY user_id, year, month HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'Hay alícuotas duplicadas por residente y mes; revísalas antes de crear dues_one_per_user_month';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS dues_one_per_user_month ON public.dues (user_id, year, month);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 10. Storage: cada residente solo accede a sus comprobantes
-- ------------------------------------------------------------
UPDATE storage.buckets SET file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf']
WHERE id = 'receipts';
UPDATE storage.buckets SET file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif']
WHERE id = 'chat_images';
UPDATE storage.buckets SET file_size_limit = 3145728,
  allowed_mime_types = ARRAY['image/png','image/jpeg','image/svg+xml','image/webp']
WHERE id = 'logos';

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname IN (
      'Public access chat images','Upload chat images','Public read receipts','Auth upload receipts',
      'Public read logos','Admins upload logos','Admins update logos','Auth view chat images',
      'Auth upload chat images','receipts_select_own','receipts_insert_own','receipts_update_own',
      'chat_images_select','chat_images_insert_own','logos_select_public','logos_admin_write',
      'logos_admin_update'
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

-- Comprobantes: ruta "<id del usuario>/archivo"; el dueño y la administración pueden verlos
CREATE POLICY "receipts_select_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin(auth.uid())));
CREATE POLICY "receipts_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "receipts_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Imágenes del chat: visibles para la comunidad; cada quien sube en su carpeta
CREATE POLICY "chat_images_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat_images');
CREATE POLICY "chat_images_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat_images' AND (storage.foldername(name))[1] = auth.uid()::text
              AND public.is_active_user(auth.uid()));

-- Logos: públicos; solo la administración sube o reemplaza
CREATE POLICY "logos_select_public" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'logos');
CREATE POLICY "logos_admin_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'logos' AND public.is_admin(auth.uid()));
CREATE POLICY "logos_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'logos' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'logos' AND public.is_admin(auth.uid()));

-- ------------------------------------------------------------
-- 11. Funciones auxiliares sin acceso anónimo
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.is_active_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_user(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.is_super_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO authenticated;

-- Alta automática de perfil, rol y llave QR al registrarse (función en la sección 8)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

NOTIFY pgrst, 'reload schema';

COMMIT;
