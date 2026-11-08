import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/lib/roles';

export interface NewResident {
  fullName: string;
  email: string;
  password: string;
  apartment?: string;
  phone?: string;
  nfc?: string;
}

export interface CreateResidentResult {
  id?: string;
  error?: string;
}

/** Lee el mensaje que devolvió la Edge Function; supabase-js solo expone "non-2xx status code". */
async function functionErrorMessage(error: { message: string; context?: unknown }): Promise<string> {
  const response = error.context as { json?: () => Promise<{ error?: string }> } | undefined;
  try {
    const body = await response?.json?.();
    if (body?.error) return body.error;
  } catch { /* respuesta sin cuerpo JSON */ }
  return error.message;
}

/**
 * Da de alta a un residente mediante la Edge Function create-resident, que usa la
 * clave de servicio y exige sesión de administración. Así el registro público puede
 * estar desactivado y la sesión del administrador no cambia.
 */
export async function createResident(input: NewResident): Promise<CreateResidentResult> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();

  // Validación rápida en pantalla; la función vuelve a validar todo
  if (!fullName || !email || !input.password) {
    return { error: 'Nombre, correo y contraseña son obligatorios' };
  }
  if (input.password.length < 8) {
    return { error: 'La contraseña inicial debe tener al menos 8 caracteres' };
  }

  const { data, error } = await supabase.functions.invoke<CreateResidentResult>('create-resident', {
    body: {
      fullName,
      email,
      password: input.password,
      apartment: input.apartment?.trim() || null,
      phone: input.phone?.trim() || null,
      nfc: input.nfc?.trim() || null,
    },
  });

  if (error) return { error: await functionErrorMessage(error) };
  if (!data?.id) return { error: data?.error ?? 'No se pudo crear la cuenta' };
  return data.error ? { id: data.id, error: data.error } : { id: data.id };
}

/** Cambia el rol de forma atómica (un solo rol por usuario) mediante la función set_user_role. */
export async function setUserRole(userId: string, role: AppRole): Promise<string | null> {
  const { error } = await supabase.rpc('set_user_role', { _target: userId, _role: role });
  return error ? error.message : null;
}
