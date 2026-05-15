import { PipelineStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getApiAccess } from "@/lib/auth/account";
import { prisma } from "@/lib/db/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await getApiAccess(request.nextUrl.searchParams);
  if (!access || access.isDemo) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { status?: string };
  const nextStatus =
    body.status === "enabled"
      ? PipelineStatus.ENABLED
      : body.status === "disabled"
        ? PipelineStatus.DISABLED
        : undefined;

  if (!id || !nextStatus) {
    return NextResponse.json({ error: "MissingPipelineFields" }, { status: 400 });
  }

  const pipeline = await prisma.pipeline.findFirst({
    where: {
      id,
      userId: access.userId
    },
    select: {
      sourceFolderId: true
    }
  });

  if (!pipeline) {
    return NextResponse.json({ error: "PipelineNotFound" }, { status: 404 });
  }

  if (nextStatus === PipelineStatus.ENABLED) {
    const folderConflict = await prisma.pipeline.findFirst({
      where: {
        id: { not: id },
        sourceFolderId: pipeline.sourceFolderId,
        status: PipelineStatus.ENABLED,
        userId: access.userId
      },
      select: { id: true, name: true }
    });

    if (folderConflict) {
      return NextResponse.json(
        {
          error: "FolderAlreadyWatched",
          message: `${folderConflict.name} is already watching this Drive folder. Disable it before enabling this pipeline.`
        },
        { status: 409 }
      );
    }
  }

  const result = await prisma.pipeline.updateMany({
    where: {
      id,
      userId: access.userId
    },
    data: {
      status: nextStatus,
      ...(nextStatus === PipelineStatus.ENABLED
        ? { errorMessage: null, processedFromTime: new Date() }
        : {})
    }
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "PipelineNotFound" }, { status: 404 });
  }

  revalidatePath("/dashboard");
  revalidatePath("/pipelines");
  return NextResponse.json({ status: nextStatus.toLowerCase() });
}
