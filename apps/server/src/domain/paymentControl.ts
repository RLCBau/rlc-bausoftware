/** All monetary comparisons are in integral euro cents. No rounding of invalid input. */
export function paymentCents(value: unknown): number {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n) || n <= 0 || n > 1_000_000_000 || Math.abs(n * 100 - Math.round(n * 100)) > 0.001) {
    throw new Error('PAYMENT_AMOUNT_INVALID');
  }
  return Math.round(n * 100);
}
export function paymentOpenCents(gross: unknown, entries: Array<{amount: unknown; direction: string}>, direction: string): number {
  const grossValue = Number(gross);
  if (!Number.isFinite(grossValue) || grossValue < 0) throw new Error('PAYMENT_GROSS_INVALID');
  const due = Math.round(grossValue * 100);
  const settled = entries.reduce((total, entry) => {
    const value = Number(entry.amount);
    if (!Number.isFinite(value)) throw new Error('PAYMENT_HISTORY_INVALID');
    return total + (entry.direction === direction ? 1 : -1) * Math.round(value * 100);
  }, 0);
  return due - settled;
}
