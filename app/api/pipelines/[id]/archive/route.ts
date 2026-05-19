import { PipelineStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getApiAccess } from "@/lib/auth/account";
import { prisma } from "@/lib/db/prisma";
import { rejectCrossSiteMutation } from "@/lib/security/request-guard";

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
      archivedAt: new Date(),
      errorMessage: null,
      status: PipelineStatus.DISABLED
    },
    where: {
      archivedAt: null,
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
  return NextResponse.json({ archived: true });
}

// Hard-delete an already-archived pipeline. Refusing to delete non-archived
// rows keeps the two-step "archive then delete" safety: a misclick can't wipe
// an active pipeline. Cascading deletes on Rule / QueueItem / UploadAttempt
// clean up dependents (see schema.prisma onDelete: Cascade).
export async function DELETE(
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

  const existing = await prisma.pipeline.findFirst({
    where: { id, userId: access.userId },
    select: { archivedAt: true }
  });
  if (!existing) {
    return NextResponse.json({ error: "PipelineNotFound" }, { status: 404 });
  }
  if (!existing.archivedAt) {
    return NextResponse.json(
      { error: "PipelineNotArchived", message: "Archive the pipeline before deleting it." },
      { status: 409 }
    );
  }

  await prisma.pipeline.delete({ where: { id } });

  revalidatePath("/dashboard");
  revalidatePath("/pipelines");
  revalidatePath("/connections");
  return NextResponse.json({ deleted: true });
}
