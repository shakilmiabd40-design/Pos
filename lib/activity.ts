import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/auth";

// Fire-and-forget audit logging. Never throws — a logging failure should
// never block the actual business operation.
export async function logActivity(
  session: SessionPayload | null,
  action: string,
  entityType: string,
  entityId?: string | null,
  details?: string
) {
  try {
    await prisma.activityLog.create({
      data: {
        userId: session?.userId || null,
        userName: session?.name || "System",
        action,
        entityType,
        entityId: entityId || null,
        details: details || null,
      },
    });
  } catch (err) {
    console.error("Failed to write activity log", err);
  }
}
