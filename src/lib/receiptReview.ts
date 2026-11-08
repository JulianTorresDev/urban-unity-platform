/**
 * Cambios que aplica la administración al revisar un comprobante (alícuotas y pagos).
 * Centralizado para que Resumen, Alícuotas y Cobranza se comporten igual.
 */

export const DEFAULT_REJECTION_REASON =
  'El comprobante no pudo validarse. Sube una captura clara de la transferencia.';

export const approvalUpdate = (now: Date = new Date()) => ({
  status: 'paid',
  paid_at: now.toISOString(),
  rejection_reason: null,
});

/**
 * Al rechazar se quita el comprobante y se guarda el motivo: antes solo se volvía a
 * "pendiente", así que el cobro seguía "En revisión" y regresaba a la cola de revisión.
 */
export const rejectionUpdate = (reason: string = DEFAULT_REJECTION_REASON) => ({
  status: 'pending',
  receipt_url: null,
  rejection_reason: reason.trim() || DEFAULT_REJECTION_REASON,
});
