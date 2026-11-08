import { supabase } from '@/integrations/supabase/client';

export interface PublicProfile {
  id: string;
  full_name: string | null;
  apartment_number: string | null;
}

/**
 * Nombre y unidad de otros residentes (sin correo, teléfono ni estado).
 * La tabla profiles es privada; este directorio mínimo lo expone la función get_public_profiles.
 */
export async function fetchPublicProfiles(ids: ReadonlyArray<string>): Promise<Map<string, PublicProfile>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase.rpc('get_public_profiles', { _ids: unique });
  if (error || !data) return new Map();
  return new Map(data.map((p) => [p.id, p]));
}
