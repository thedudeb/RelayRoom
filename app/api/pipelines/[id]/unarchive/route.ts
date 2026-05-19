import { PipelineStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getApiAccess } from "@/lib/auth/account";
import { prisma } from "@/lib/db/prisma";
import { rejectCrossSiteMutation } from "@/lib/security/request-guard";

// Restore an archived pipeline. Lives at its own URL so DELETE /archive can
// mean "actually delete" without the "delete = restore" trap that the prior
// design left behind (ISSUE-034).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originError = rejectCrossSiteMutation(request);
  if (originError) {
    return originError;
  }

  const access = await getApiAccess(request.nextUrl.searchParams);
  if (!access || access.isDemo) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "MissingPipelineFields" }, { status: 400 });
  }

  const result = await prisma.pipeline.updateMany({
    data: {
      archivedAt: null,
      errorMessage: null,
      status: PipelineStatus.DISABLED
    },
    where: {
      archivedAt: { not: null },
      id,
      userId: access.userId
    }
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "PipelineNotFound" }, { status: 404 });
  }

  revalidatePath("/dashboard");
  revalidatePath("/pipelines");
  revalidatePath("/connections");
  return NextResponse.json({ restored: true });
}
