import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hashPassword } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { ALL_MODULE_KEYS } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

function cleanPermissions(input: any): string[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) return [];
  return input.filter((p) => ALL_MODULE_KEYS.includes(p));
}

// body: { name, role, active, password, permissions }
// Note: permission changes take effect the next time that user logs in
// (their current session cookie already has the old list baked in).
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);
  if (session.role !== "ADMIN") return jsonError("Admin only", 403);

  const { name, role, active, password, permissions } = await req.json();
  const user = await prisma.user.update({
    where: { id: params.id },
    data: {
      name: name ?? undefined,
      role: role === "ADMIN" || role === "STAFF" ? role : undefined,
      active: active !== undefined ? Boolean(active) : undefined,
      passwordHash: password ? await hashPassword(password) : undefined,
      permissions: cleanPermissions(permissions),
    },
    select: { id: true, name: true, email: true, role: true, active: true, permissions: true },
  });
  await logActivity(session, "UPDATE", "User", params.id, user.name);
  return NextResponse.json(user);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);
  if (session.role !== "ADMIN") return jsonError("Admin only", 403);
  if (session.userId === params.id) return jsonError("You can't delete your own account while logged in");

  const existing = await prisma.user.findUnique({ where: { id: params.id } });

  try {
    await prisma.user.delete({ where: { id: params.id } });
    await logActivity(session, "DELETE", "User", params.id, existing?.name);
    return NextResponse.json({ ok: true });
  } catch {
    await prisma.user.update({ where: { id: params.id }, data: { active: false } });
    await logActivity(session, "DEACTIVATE", "User", params.id, existing?.name);
    return NextResponse.json({ ok: true, softDeleted: true });
  }
}
