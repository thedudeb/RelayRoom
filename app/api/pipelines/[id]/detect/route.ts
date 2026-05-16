import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getApiAccess } from "@/lib/auth/account";
import { runDriveDetectionForPipeline } from "@/lib/detection/drive-detection";
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
  if (!id) {
    return NextResponse.json({ error: "MissingPipelineFields" }, { status: 400 });
  }

  try {
    const pipeline = await prisma.pipeline.findFirst({
      where: { archivedAt: null, id },
      select: { userId: true }
    });
    if (!pipeline) {
      return NextResponse.json({ error: "PipelineNotFound" }, { status: 404 });
    }

    const result = await runDriveDetectionForPipeline({
      pipelineId: id,
      userId: pipeline.userId
    });

    revalidatePath("/dashboard");
    revalidatePath("/pipelines");
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "DetectionFailed" },
      { status: 400 }
    );
  }
}
