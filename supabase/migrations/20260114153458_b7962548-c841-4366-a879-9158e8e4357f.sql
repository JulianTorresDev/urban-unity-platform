-- Add pricing columns to resources table
ALTER TABLE public.resources 
ADD COLUMN base_price NUMERIC DEFAULT 0,
ADD COLUMN price_per_hour NUMERIC DEFAULT 0;

-- Add price column to reservations to capture price at booking time
ALTER TABLE public.reservations 
ADD COLUMN price NUMERIC DEFAULT 0,
ADD COLUMN rejection_reason TEXT;

-- Enable realtime for reservations table
ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;