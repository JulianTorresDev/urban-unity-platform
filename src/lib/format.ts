/**
 * Montos en dólares con el mismo formato en toda la app: "$1,250.00".
 * Antes convivían "$50.00" y "$50,00" según la pantalla.
 */
export const formatUSD = (amount: number | string | null | undefined): string => {
  const n = Number(amount ?? 0);
  return `$${(Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
