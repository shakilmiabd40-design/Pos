import { describe, it, expect } from "vitest";
import { genInvoiceNo, oneYearLater, dateRangeFilter } from "@/lib/api-helpers";

describe("api-helpers", () => {
  it("genInvoiceNo produces a prefixed, sortable, unique-ish invoice number", () => {
    const a = genInvoiceNo("INV");
    const b = genInvoiceNo("INV");
    expect(a).toMatch(/^INV-\d{14}-\d{3}$/);
    expect(b).toMatch(/^INV-\d{14}-\d{3}$/);
  });

  it("oneYearLater adds exactly one calendar year for warranty end dates", () => {
    const start = new Date("2026-09-11T00:00:00.000Z");
    const end = oneYearLater(start);
    expect(end.getUTCFullYear()).toBe(start.getUTCFullYear() + 1);
    expect(end.getUTCMonth()).toBe(start.getUTCMonth());
    expect(end.getUTCDate()).toBe(start.getUTCDate());
  });

  it("dateRangeFilter returns undefined bounds when no from/to given", () => {
    const range = dateRangeFilter(null, null);
    expect(range.gte).toBeUndefined();
    expect(range.lte).toBeUndefined();
  });

  it("dateRangeFilter turns from/to date strings into a BD-day-aware range", () => {
    const range = dateRangeFilter("2026-01-01", "2026-01-31");
    expect(range.gte).toBeInstanceOf(Date);
    expect(range.lte).toBeInstanceOf(Date);
    expect(range.gte!.getTime()).toBeLessThan(range.lte!.getTime());
  });
});
