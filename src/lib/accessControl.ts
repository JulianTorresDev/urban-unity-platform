export type AccessReason = 'ok' | 'unknown' | 'expired' | 'blocked';

export interface TokenRecord {
  expires_at?: string | null;
  profiles?: { status?: string | null } | null;
}

/** Decide en la garita si un token QR abre la talanquera. */
export function evaluateAccessToken(record: TokenRecord | null | undefined, now: Date = new Date()): {
  valid: boolean;
  reason: AccessReason;
} {
  if (!record) return { valid: false, reason: 'unknown' };
  if (record.expires_at && new Date(record.expires_at).getTime() <= now.getTime()) {
    return { valid: false, reason: 'expired' };
  }
  if (record.profiles?.status === 'blocked') return { valid: false, reason: 'blocked' };
  return { valid: true, reason: 'ok' };
}

/**
 * Extrae el token del contenido escaneado. El QR del residente es JSON {"t": token, ...};
 * se acepta también el token en texto plano. Nunca devuelve más de 128 caracteres.
 */
export function parseQrPayload(text: string): string {
  const raw = text.trim();
  try {
    const data = JSON.parse(raw);
    if (data && typeof data.t === 'string') return data.t.slice(0, 128);
  } catch {
    // texto plano
  }
  return raw.slice(0, 128);
}
