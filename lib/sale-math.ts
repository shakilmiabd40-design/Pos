// Pure math for sale totals — no DB access — so it can be unit tested and
// shared between the API route and (if ever needed) the client.

export type SaleLine = { qty: number; unitPrice: number; discount?: number };
export type SplitPaymentInput = { method: string; amount: number };

// Sum of (qty * unitPrice - per-line discount) across all lines, floored at
// 0 per line so a typo'd discount can't make a line negative.
export function computeItemsSubtotal(items: SaleLine[]): number {
  return items.reduce((sum, it) => {
    const lineDiscount = Math.max(0, it.discount || 0);
    return sum + Math.max(0, Number(it.qty) * Number(it.unitPrice) - lineDiscount);
  }, 0);
}

export function computeSaleTotal(opts: {
  items: SaleLine[];
  saleDiscount?: number;
  deliveryCharge?: number;
}): number {
  const subtotal = computeItemsSubtotal(opts.items);
  const saleDiscount = Math.max(0, opts.saleDiscount || 0);
  const deliveryCharge = Math.max(0, opts.deliveryCharge || 0);
  return Math.max(0, subtotal - saleDiscount) + deliveryCharge;
}

// Scales a set of split-payment rows down proportionally if they add up to
// more than the total (e.g. rounding on the till side), so the recorded
// payments always sum to exactly the amount actually collected — never
// more than the sale total.
export function scaleSplitPayments(payments: SplitPaymentInput[], totalCollected: number): SplitPaymentInput[] {
  const rawSum = payments.reduce((s, p) => s + p.amount, 0);
  const scale = rawSum > totalCollected && rawSum > 0 ? totalCollected / rawSum : 1;
  return payments
    .map((p) => ({ method: p.method, amount: Math.round(p.amount * scale * 100) / 100 }))
    .filter((p) => p.amount > 0);
}
