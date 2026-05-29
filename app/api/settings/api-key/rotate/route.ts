import { NextRequest, NextResponse } from "next/server";
import { getApiAccess } from "@/lib/auth/account";
import { prisma } from "@/lib/db/prisma";
import { generateApiKey, hashApiKey } from "@/lib/security/api-keys";
import { rejectCrossSiteMutation } from "@/lib/security/request-guard";

// Rotates the caller's read-only API key: revokes any existing active keys and
// issues a fresh one. The plaintext key is returned exactly once here — only its
// hash is stored, so it can never be shown again.
export async function POST(request: NextRequest) {
  // Mutation guard chain: no cross-site calls, no demo (read-only) users.
  const originError = rejectCrossSiteMutation(request);
  if (originError) {
    return originError;
  }

  const access = await getApiAccess(request.nextUrl.searchParams);
  if (!access || access.isDemo) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = generateApiKey();
  const now = new Date();

  // Revoke-then-create in one transaction so there's never a window with two
  // active keys, nor one with none if the create fails.
  await prisma.$transaction([
    prisma.apiKey.updateMany({
      where: {
        revokedAt: null,
        userId: access.userId
      },
      data: { revokedAt: now }
    }),
    prisma.apiKey.create({
      data: {
        keyHash: hashApiKey(apiKey),
        name: "Read-only API key",
        userId: access.userId
      }
    })
  ]);

  return NextResponse.json({
    apiKey,
    message: "Read-only API key rotated. Store this value now; RelayRoom cannot show it again."
  });
}
