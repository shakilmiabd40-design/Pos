import { describe, it, expect } from "vitest";
import { computeItemsSubtotal, computeSaleTotal, scaleSplitPayments } from "@/lib/sale-math";

describe("sale-math", () => {
  it("subtracts each line's own discount before summing", () => {
    const subtotal = computeItemsSubtotal([
      { qty: 2, unitPrice: 500, discount: 50 }, // 1000 - 50 = 950
      { qty: 1, unitPrice: 300 }, // 300
    ]);
    expect(subtotal).toBe(1250);
  });

  it("never lets a single line go negative from an oversized discount", () => {
    const subtotal = computeItemsSubtotal([{ qty: 1, unitPrice: 100, discount: 500 }]);
    expect(subtotal).toBe(0);
  });

  it("applies the sale-level discount and adds delivery charge on top", () => {
    const total = computeSaleTotal({
      items: [{ qty: 1, unitPrice: 1000 }],
      saleDiscount: 100,
      deliveryCharge: 60,
    });
    expect(total).toBe(960); // (1000 - 100) + 60
  });

  it("passes split payments through unchanged when they add up to the total", () => {
    const scaled = scaleSplitPayments([{ method: "cash", amount: 600 }, { method: "bkash", amount: 400 }], 1000);
    expect(scaled).toEqual([
      { method: "cash", amount: 600 },
      { method: "bkash", amount: 400 },
    ]);
  });

  it("scales split payments down proportionally if they overshoot the total", () => {
    // Entered 700 + 500 = 1200 by mistake, but the sale total is only 1000.
    const scaled = scaleSplitPayments([{ method: "cash", amount: 700 }, { method: "bkash", amount: 500 }], 1000);
    const sum = scaled.reduce((s, p) => s + p.amount, 0);
    expect(sum).toBeCloseTo(1000, 2);
    // Proportions should be preserved (700:500 = 7:5).
    expect(scaled[0].amount / scaled[1].amount).toBeCloseTo(700 / 500, 2);
  });

  it("drops zero/negative payment rows after scaling", () => {
    const scaled = scaleSplitPayments([{ method: "cash", amount: 0 }, { method: "bkash", amount: 500 }], 500);
    expect(scaled).toEqual([{ method: "bkash", amount: 500 }]);
  });
});
