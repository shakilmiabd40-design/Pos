import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { ALL_MODULE_KEYS } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

function cleanPermissions(input: any): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((p) => ALL_MODULE_KEYS.includes(p));
}

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);
  if (session.role !== "ADMIN") return jsonError("Admin only", 403);
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, active: true, permissions: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(users);
}

// body: { name, email, password, role, permissions: string[] }
// permissions only matter for STAFF — ADMIN always has full access.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);
  if (session.role !== "ADMIN") return jsonError("Admin only", 403);

  const { name, email, password, role, permissions } = await req.json();
  if (!name || !email || !password) return jsonError("Name, email and password are required");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return jsonError("A user with this email already exists");

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      role: role === "ADMIN" ? "ADMIN" : "STAFF",
      permissions: cleanPermissions(permissions),
    },
    select: { id: true, name: true, email: true, role: true, active: true, permissions: true },
  });
  await logActivity(session, "CREATE", "User", user.id, `${name} (${user.role})`);
  return NextResponse.json(user, { status: 201 });
}
