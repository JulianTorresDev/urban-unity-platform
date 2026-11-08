// Utilidades de seguridad para las Edge Functions. Sin dependencias de Deno,
// para poder probarlas con Vitest (ver security.test.ts).

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapa cualquier valor antes de insertarlo en el HTML de un correo. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;

export function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value);
}

/** Extrae el JWT de la cabecera Authorization ("Bearer <token>"). */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

export type AuthDecision =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Autoriza la llamada: exige un usuario autenticado (no basta la clave anónima)
 * y, si se pide, que sea administrador.
 */
export async function authorizeRequest(
  authHeader: string | null | undefined,
  deps: {
    getUserId: (jwt: string) => Promise<string | null>;
    isAdmin: (userId: string) => Promise<boolean>;
  },
  requireAdmin = true,
  forbiddenMessage = 'Solo la administración puede enviar notificaciones'
): Promise<AuthDecision> {
  const jwt = bearerToken(authHeader);
  if (!jwt) return { ok: false, status: 401, error: 'Falta el token de sesión' };

  const userId = await deps.getUserId(jwt);
  if (!userId) return { ok: false, status: 401, error: 'Sesión inválida o vencida' };

  if (requireAdmin && !(await deps.isAdmin(userId))) {
    return { ok: false, status: 403, error: forbiddenMessage };
  }
  return { ok: true, userId };
}

export interface NewResidentInput {
  fullName?: unknown;
  email?: unknown;
  password?: unknown;
  apartment?: unknown;
  phone?: unknown;
  nfc?: unknown;
}

export interface NewResident {
  fullName: string;
  email: string;
  password: string;
  apartment: string | null;
  phone: string | null;
  nfc: string | null;
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Valida y normaliza los datos de un residente nuevo (la función create-resident no confía en el navegador). */
export function validateNewResident(input: NewResidentInput): { ok: true; value: NewResident } | { ok: false; error: string } {
  const fullName = text(input.fullName, 120);
  const email = text(input.email, 254).toLowerCase();
  const password = typeof input.password === 'string' ? input.password : '';

  if (!fullName || !email || !password) return { ok: false, error: 'Nombre, correo y contraseña son obligatorios' };
  if (!isValidEmail(email)) return { ok: false, error: 'El correo no es válido' };
  if (password.length < 8) return { ok: false, error: 'La contraseña inicial debe tener al menos 8 caracteres' };
  if (password.length > 72) return { ok: false, error: 'La contraseña no puede superar los 72 caracteres' };

  return {
    ok: true,
    value: {
      fullName,
      email,
      password,
      apartment: text(input.apartment, 20) || null,
      phone: text(input.phone, 30) || null,
      nfc: text(input.nfc, 60) || null,
    },
  };
}
