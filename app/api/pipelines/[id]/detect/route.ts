import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getApiAccess } from "@/lib/auth/account";
import { runDriveDetectionForPipeline } from "@/lib/detection/drive-detection";
import { prisma } from "@/lib/db/prisma";
import { areGoogleIntegrationsPaused, googleIntegrationsPausedResponse } from "@/lib/google/integrations";
import { rejectCrossSiteMutation } from "@/lib/security/request-guard";

// Manual "check for new files now" trigger for a single pipeline, bypassing the
// polling schedule. Runs the same detection routine the cron uses, then
// revalidates the pages that display queue results.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (areGoogleIntegrationsPaused()) {
    return googleIntegrationsPausedResponse();
  }

  // Standard mutation guard chain: block cross-site calls, require a real
  // (non-demo) authenticated user — demo mode is read-only.
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

  try {
    // Scope the lookup to the caller's own, non-archived pipelines so one user
    // can't trigger detection on another's pipeline (or a 404 leaking existence).
    const pipeline = await prisma.pipeline.findFirst({
      where: { archivedAt: null, id, userId: access.userId },
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
