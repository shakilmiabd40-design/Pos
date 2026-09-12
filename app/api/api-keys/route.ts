import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession, hashPassword } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";

// Admin only. Never returns apiSecretHash — the plaintext secret is only
// ever shown once, in the POST response at creation time.
export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);
  if (session.role !== "ADMIN") return jsonError("Admin only", 403);

  const keys = await prisma.apiCredential.findMany({
    select: { id: true, name: true, apiKey: true, active: true, lastUsedAt: true, createdAt: true, createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(keys);
}

// body: { name }
// Returns the plaintext secret exactly once — store it now, it can't be
// retrieved again after this response.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);
  if (session.role !== "ADMIN") return jsonError("Admin only", 403);

  const { name } = await req.json();
  if (!name) return jsonError("Give this key a name (e.g. 'Main website')");

  const apiKey = `key_${crypto.randomBytes(16).toString("hex")}`;
  const apiSecret = crypto.randomBytes(32).toString("hex");
  const apiSecretHash = await hashPassword(apiSecret);

  const credential = await prisma.apiCredential.create({
    data: { name, apiKey, apiSecretHash, createdById: session.userId },
    select: { id: true, name: true, apiKey: true, active: true, createdAt: true },
  });

  await logActivity(session, "CREATE", "ApiCredential", credential.id, name);

  return NextResponse.json({ ...credential, apiSecret }, { status: 201 });
}
