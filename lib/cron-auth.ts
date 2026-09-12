import { NextRequest } from "next/server";

// Vercel Cron automatically sends `Authorization: Bearer <CRON_SECRET>` to
// scheduled routes when a CRON_SECRET env var is set on the project — see
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
// If CRON_SECRET isn't set, we allow the call through (useful for local
// testing) but log a warning since that means the endpoint is unprotected.
export function checkCronAuth(req: NextRequest): string | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("CRON_SECRET is not set — cron endpoint is unprotected. Set it in your env vars.");
    return null;
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) return "Unauthorized";
  return null;
}
