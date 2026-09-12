import { prisma } from "@/lib/prisma";

// Simple DB-backed sliding-window rate limiter for the public
// (/api/public/*) endpoints — no extra service needed, just a small table
// in the same Postgres database. Not perfectly precise under very heavy
// concurrency, but enough to stop a runaway script or bot from hammering
// the API and running up load (or, for /api/public/orders, creating junk
// sales/consuming stock).
const WINDOW_MS = 60_000; // 1 minute
const MAX_HITS_PER_WINDOW = 60; // ~1 request/second sustained, per API key

// Returns an error message if the key is over the limit, otherwise null
// (and records this call as a hit).
export async function checkRateLimit(identifier: string): Promise<string | null> {
  const windowStart = new Date(Date.now() - WINDOW_MS);

  let count = 0;
  try {
    count = await prisma.apiRateLimitHit.count({
      where: { apiKey: identifier, createdAt: { gte: windowStart } },
    });
  } catch (err) {
    // If the rate-limit table itself is unreachable, fail open rather than
    // blocking real traffic over an infrastructure hiccup.
    console.error("Rate limit check failed, allowing request", err);
    return null;
  }

  if (count >= MAX_HITS_PER_WINDOW) {
    return `Too many requests — limit is ${MAX_HITS_PER_WINDOW} requests/minute per API key. Please slow down and try again shortly.`;
  }

  // Fire-and-forget: record this hit, and opportunistically clean up old
  // rows so the table doesn't grow unbounded. Neither should block the
  // response.
  prisma.apiRateLimitHit.create({ data: { apiKey: identifier } }).catch(() => {});
  prisma.apiRateLimitHit.deleteMany({ where: { createdAt: { lt: windowStart } } }).catch(() => {});

  return null;
}
