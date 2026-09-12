import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";

// Admin-only: remove a single activity log entry. Deleting log entries is
// not itself logged (that would just recreate the entry you're removing).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);
  if (session.role !== "ADMIN") return jsonError("Admin only", 403);

  try {
    await prisma.activityLog.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return jsonError("Log entry not found", 404);
  }
}
