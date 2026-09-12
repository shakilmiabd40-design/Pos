import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";

// body: { active: boolean } — enable/disable a key without deleting it.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);
  if (session.role !== "ADMIN") return jsonError("Admin only", 403);

  const { active } = await req.json();
  const credential = await prisma.apiCredential.update({
    where: { id: params.id },
    data: { active: Boolean(active) },
    select: { id: true, name: true, active: true },
  });

  await logActivity(session, active ? "ENABLE" : "DISABLE", "ApiCredential", params.id, credential.name);
  return NextResponse.json(credential);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);
  if (session.role !== "ADMIN") return jsonError("Admin only", 403);

  const existing = await prisma.apiCredential.findUnique({ where: { id: params.id } });
  await prisma.apiCredential.delete({ where: { id: params.id } });
  await logActivity(session, "DELETE", "ApiCredential", params.id, existing?.name);
  return NextResponse.json({ ok: true });
}
