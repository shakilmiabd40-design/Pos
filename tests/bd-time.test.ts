import { describe, it, expect } from "vitest";
import { startOfBdDay, endOfBdDay, bdDayRangeFromDateString, bdDateString } from "@/lib/bd-time";

describe("bd-time", () => {
  it("computes the start of a BD day as 18:00 UTC the previous day (UTC+6)", () => {
    // 2026-03-15 10:00 UTC is 2026-03-15 16:00 in Dhaka — same BD day.
    const d = new Date("2026-03-15T10:00:00.000Z");
    const start = startOfBdDay(d);
    expect(start.toISOString()).toBe("2026-03-14T18:00:00.000Z");
  });

  it("computes the end of a BD day just before the next start", () => {
    const d = new Date("2026-03-15T10:00:00.000Z");
    const end = endOfBdDay(d);
    expect(end.toISOString()).toBe("2026-03-15T17:59:59.999Z");
  });

  it("parses a plain YYYY-MM-DD as a BD calendar day, not a UTC one", () => {
    const { start, end } = bdDayRangeFromDateString("2026-01-01");
    expect(start.toISOString()).toBe("2025-12-31T18:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-01T17:59:59.999Z");
  });

  it("formats back to the same YYYY-MM-DD string for a moment inside that BD day", () => {
    const { start } = bdDayRangeFromDateString("2026-06-01");
    // A moment safely inside the BD day (start + 1 hour) should format back to 2026-06-01.
    expect(bdDateString(new Date(start.getTime() + 60 * 60 * 1000))).toBe("2026-06-01");
  });
});
