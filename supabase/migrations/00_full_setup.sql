-- ============================================================
-- URBAN UNITY PLATFORM — SETUP COMPLETO DESDE CERO
-- Ejecutar en Supabase SQL Editor → presionar RUN
-- Este script crea TODA la estructura de la base de datos
-- ============================================================

-- =====================
-- ENUMS
-- =====================
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'resident');

-- =====================
-- TABLAS PRINCIPALES
-- =====================

-- Perfiles de usuario
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  apartment_number TEXT,
  phone TEXT,
  apartment_type_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Roles de usuario
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'resident',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Noticias
CREATE TABLE public.news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pagos
CREATE TABLE public.payments (
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

-- Tipos de apartamento (para alícuotas)
CREATE TABLE public.apartment_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  monthly_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Alícuotas mensuales
CREATE TABLE public.dues (
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

-- Recursos reservables
CREATE TABLE public.resources (
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

-- Reservas
CREATE TABLE public.reservations (
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

-- Tickets / PQR
CREATE TABLE public.tickets (
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

-- Chat comunitario
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK de chat_messages apuntando a profiles (no auth.users) para el JOIN
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Configuración del sistema (personalización de marca)
CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT 'Urban Unity',
  logo_url TEXT,
  primary_color TEXT DEFAULT '#3b82f6',
  secondary_color TEXT DEFAULT '#1e293b',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tokens de acceso QR
CREATE TABLE public.access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  domicile_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('permanent', 'temporary')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.access_tokens
  ADD CONSTRAINT access_tokens_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Transacciones de pago (Kushki)
CREATE TABLE public.kushki_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  transaction_token TEXT,
  amount DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL,
  response_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK de profiles.apartment_type_id
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_apartment_type_id_fkey
  FOREIGN KEY (apartment_type_id) REFERENCES public.apartment_types(id) ON DELETE SET NULL;

-- =====================
-- FUNCIONES DE SEGURIDAD
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

-- =====================
-- TRIGGER: CREAR PERFIL AL REGISTRARSE
-- =====================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name');
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'resident');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================
-- TRIGGER: UPDATED_AT
-- =====================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_news_updated_at BEFORE UPDATE ON public.news FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================
-- RLS (Row Level Security)
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
ALTER TABLE public.kushki_transactions ENABLE ROW LEVEL SECURITY;

-- =====================
-- POLÍTICAS DE SEGURIDAD
-- =====================

-- Profiles
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- User roles
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Super admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- News
CREATE POLICY "Anyone view news" ON public.news FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage news" ON public.news FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Payments
CREATE POLICY "Users view own payments" ON public.payments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all payments" ON public.payments FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins manage payments" ON public.payments FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Apartment types
CREATE POLICY "Anyone view types" ON public.apartment_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage types" ON public.apartment_types FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Dues
CREATE POLICY "Users view own dues" ON public.dues FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all dues" ON public.dues FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins manage dues" ON public.dues FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Resources
CREATE POLICY "Anyone view resources" ON public.resources FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage resources" ON public.resources FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Reservations
CREATE POLICY "Users view all reservations" ON public.reservations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users create own reservations" ON public.reservations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users cancel own reservations" ON public.reservations FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins manage reservations" ON public.reservations FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Tickets
CREATE POLICY "Users view own tickets" ON public.tickets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all tickets" ON public.tickets FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Users create tickets" ON public.tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins update tickets" ON public.tickets FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

-- Chat
CREATE POLICY "Anyone view chat" ON public.chat_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users send chat" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

-- System settings
CREATE POLICY "Authenticated view settings" ON public.system_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage settings" ON public.system_settings FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Access tokens
CREATE POLICY "Users view own tokens" ON public.access_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own tokens" ON public.access_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own tokens" ON public.access_tokens FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins manage tokens" ON public.access_tokens FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Kushki transactions
CREATE POLICY "Users view own txns" ON public.kushki_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all txns" ON public.kushki_transactions FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- =====================
-- REALTIME
-- =====================
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- =====================
-- STORAGE (Imágenes del Chat)
-- =====================
INSERT INTO storage.buckets (id, name, public) VALUES ('chat_images', 'chat_images', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Auth view chat images" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'chat_images');
CREATE POLICY "Auth upload chat images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat_images');

-- =====================
-- DATOS INICIALES
-- =====================

-- Configuración por defecto
INSERT INTO public.system_settings (company_name) VALUES ('Urban Unity');

-- Recursos reservables por defecto
INSERT INTO public.resources (name, description) VALUES
('Zonas Verdes', 'Áreas de jardín y recreación al aire libre'),
('Salón Social', 'Espacio cerrado para eventos y celebraciones'),
('Parqueadero Visitantes', 'Plazas de estacionamiento para invitados');

-- =====================
-- REFRESCAR CACHÉ
-- =====================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- ✅ SETUP COMPLETO. 
-- Ahora registra un usuario y luego ejecuta el script 
-- de abajo para hacerlo Super Admin.
-- ============================================================
