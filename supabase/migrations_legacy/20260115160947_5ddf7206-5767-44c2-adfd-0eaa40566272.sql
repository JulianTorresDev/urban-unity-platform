-- Drop the existing check constraint
ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_status_check;

-- Add a new check constraint that includes 'pending'
ALTER TABLE public.reservations ADD CONSTRAINT reservations_status_check 
CHECK (status IN ('pending', 'confirmed', 'cancelled', 'rejected'));