import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";

// One-time first-run setup. Only works while the Users table is empty —
// once any user exists, this endpoint refuses to create another one, so it
// can't be used to bypass normal admin-only user creation later.

export async function GET() {
  const userCount = await prisma.user.count();
  return NextResponse.json({ needsSetup: userCount === 0 });
}

// body: { name, email, password }
export async function POST(req: NextRequest) {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    return jsonError("Setup has already been completed. Log in and use the Users page to add more accounts.", 403);
  }

  const { name, email, password } = await req.json();
  if (!name || !email || !password) return jsonError("Name, email and password are required");
  if (password.length < 6) return jsonError("Password must be at least 6 characters");

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      role: "ADMIN",
    },
    select: { id: true, name: true, email: true, role: true },
  });

  return NextResponse.json(user, { status: 201 });
}
