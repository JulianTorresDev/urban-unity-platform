
-- Create access_codes table
CREATE TABLE public.access_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'resident' CHECK (type IN ('resident', 'visitor')),
  visitor_name TEXT,
  visitor_document TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all access codes"
ON public.access_codes FOR ALL
TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "Users can view their own access codes"
ON public.access_codes FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Create access_logs table
CREATE TABLE public.access_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  access_code_id UUID NOT NULL REFERENCES public.access_codes(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('entry', 'exit')),
  scanned_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage access logs"
ON public.access_logs FOR ALL
TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "Users can view their own access logs"
ON public.access_logs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.access_codes
    WHERE access_codes.id = access_logs.access_code_id
    AND access_codes.user_id = auth.uid()
  )
);

-- Add updated_at trigger
CREATE TRIGGER update_access_codes_updated_at
BEFORE UPDATE ON public.access_codes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for access_logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.access_logs;
