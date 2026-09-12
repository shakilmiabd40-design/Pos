// The shop operates in Bangladesh (Asia/Dhaka, UTC+6, no daylight saving).
// Serverless hosts like Vercel run in UTC, so naive `date.setHours(0,0,0,0)`
// computes midnight in the SERVER's timezone, not the shop's — silently
// shifting every "today" / day-boundary calculation by 6 hours. These
// helpers always compute boundaries relative to Bangladesh wall-clock time,
// regardless of what timezone the server process itself is running in.

const BD_OFFSET_MS = 6 * 60 * 60 * 1000;

// The UTC instant that corresponds to 00:00:00 Bangladesh time on the
// calendar day containing `date` (default: right now).
export function startOfBdDay(date: Date = new Date()): Date {
  const shifted = new Date(date.getTime() + BD_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - BD_OFFSET_MS);
}

// The UTC instant that corresponds to 23:59:59.999 Bangladesh time on the
// calendar day containing `date`.
export function endOfBdDay(date: Date = new Date()): Date {
  const start = startOfBdDay(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

// Parses a plain "YYYY-MM-DD" string (e.g. from an <input type="date">) as
// a Bangladesh calendar day and returns its start/end as UTC instants.
export function bdDayRangeFromDateString(dateStr: string): { start: Date; end: Date } {
  // Treat the string as a BD calendar date directly (not UTC) by parsing
  // its parts rather than letting `new Date(str)` assume UTC midnight.
  const [y, m, d] = dateStr.split("-").map(Number);
  const bdMidnightAsUtc = new Date(Date.UTC(y, (m || 1) - 1, d || 1) - BD_OFFSET_MS);
  return { start: bdMidnightAsUtc, end: new Date(bdMidnightAsUtc.getTime() + 24 * 60 * 60 * 1000 - 1) };
}

// "YYYY-MM-DD" for the current moment, in Bangladesh wall-clock time —
// safe to use for a date-picker's default value even if the browser or
// server happens to be set to a different timezone.
export function bdDateString(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() + BD_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}
