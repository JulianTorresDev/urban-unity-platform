-- Drop existing SELECT policies that restrict visibility
DROP POLICY IF EXISTS "Users can view their own reservations" ON public.reservations;
DROP POLICY IF EXISTS "Users can view all reservations for availability" ON public.reservations;

-- Create new policy allowing anyone authenticated to view all reservations
CREATE POLICY "Anyone can view all reservations"
ON public.reservations
FOR SELECT
USING (true);