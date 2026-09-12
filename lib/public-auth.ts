import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";

// Auth for the public website API. Your website sends two headers:
//   X-API-Key:    the key (public identifier, generated from Settings → API keys)
//   X-API-Secret: the matching secret
// Falls back to the single WEBSITE_API_KEY env var (checked against
// X-API-Key alone, no secret) for setups that predate generated keys.
export async function checkPublicApiKey(req: NextRequest): Promise<string | null> {
  const providedKey = req.headers.get("x-api-key");
  const providedSecret = req.headers.get("x-api-secret");

  const activeCredentialCount = await prisma.apiCredential.count({ where: { active: true } });

  if (activeCredentialCount === 0) {
    // No generated keys exist yet — fall back to the legacy single env-var
    // key so existing setups keep working. Once you generate a key from
    // Settings → API keys, that key is required instead.
    const legacyKey = process.env.WEBSITE_API_KEY;
    if (!legacyKey) return null; // nothing configured at all -> open (dev only)
    if (providedKey !== legacyKey) return "Invalid or missing API key";
    return null;
  }

  if (!providedKey || !providedSecret) return "Missing X-API-Key or X-API-Secret header";

  const credential = await prisma.apiCredential.findUnique({ where: { apiKey: providedKey } });
  if (!credential || !credential.active) return "Invalid or missing API key";

  const validSecret = await verifyPassword(providedSecret, credential.apiSecretHash);
  if (!validSecret) return "Invalid or missing API key";

  prisma.apiCredential.update({ where: { id: credential.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return null;
}
