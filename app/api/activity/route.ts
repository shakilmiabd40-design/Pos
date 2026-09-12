import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);
  if (session.role !== "ADMIN") return jsonError("Admin only", 403);

  const take = Math.min(Number(req.nextUrl.searchParams.get("take")) || 200, 500);

  const logs = await prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take,
  });
  return NextResponse.json(logs);
}

// Admin-only: clear the entire activity log. Used sparingly — this removes
// the audit trail, so the UI should ask for strong confirmation first.
export async function DELETE() {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);
  if (session.role !== "ADMIN") return jsonError("Admin only", 403);

  await prisma.activityLog.deleteMany({});
  return NextResponse.json({ ok: true });
}
