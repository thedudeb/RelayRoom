import { NextRequest, NextResponse } from "next/server";
import { getApiAccess } from "@/lib/auth/account";
import { prisma } from "@/lib/db/prisma";
import { generateApiKey, hashApiKey } from "@/lib/security/api-keys";
import { rejectCrossSiteMutation } from "@/lib/security/request-guard";

export async function POST(request: NextRequest) {
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
