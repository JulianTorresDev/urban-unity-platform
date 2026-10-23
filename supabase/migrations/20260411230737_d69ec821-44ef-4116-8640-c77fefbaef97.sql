
-- Create apartment_types table
CREATE TABLE public.apartment_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_fee NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.apartment_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage apartment types" ON public.apartment_types
  FOR ALL TO authenticated USING (is_admin(auth.uid()));

CREATE POLICY "Anyone can view apartment types" ON public.apartment_types
  FOR SELECT TO authenticated USING (true);

-- Create dues table (alícuotas)
CREATE TABLE public.dues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  apartment_type_id UUID REFERENCES public.apartment_types(id),
  amount NUMERIC NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  paid_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, month, year)
);

ALTER TABLE public.dues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all dues" ON public.dues
  FOR ALL TO authenticated USING (is_admin(auth.uid()));

CREATE POLICY "Users can view their own dues" ON public.dues
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Add apartment_type_id to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS apartment_type_id UUID REFERENCES public.apartment_types(id);

-- Trigger for updated_at on apartment_types
CREATE TRIGGER update_apartment_types_updated_at
  BEFORE UPDATE ON public.apartment_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on dues
CREATE TRIGGER update_dues_updated_at
  BEFORE UPDATE ON public.dues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
