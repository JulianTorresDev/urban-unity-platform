-- Create system_settings table
CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT 'Urban Unity',
  logo_url TEXT,
  primary_color TEXT DEFAULT '#3b82f6',
  secondary_color TEXT DEFAULT '#1e293b',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert initial settings
INSERT INTO public.system_settings (company_name) VALUES ('Urban Unity');

-- Create kushki_transactions table
CREATE TABLE public.kushki_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  transaction_token TEXT,
  amount DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL, -- pending, approved, declined, voided
  response_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create access_tokens table (for QR Access)
CREATE TABLE public.access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  domicile_id TEXT NOT NULL, -- link to apartment_number or similar
  token TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('permanent', 'temporary')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kushki_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_tokens ENABLE ROW LEVEL SECURITY;

-- Policies for system_settings
CREATE POLICY "Public can view system settings" ON public.system_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage system settings" ON public.system_settings
  FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Policies for kushki_transactions
CREATE POLICY "Users can view their own transactions" ON public.kushki_transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all transactions" ON public.kushki_transactions
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- Policies for access_tokens
CREATE POLICY "Users can view their own tokens" ON public.access_tokens
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all tokens" ON public.access_tokens
  FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Add realtime for transactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.kushki_transactions;
