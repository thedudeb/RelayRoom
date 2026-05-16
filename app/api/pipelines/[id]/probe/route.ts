import { NextRequest, NextResponse } from "next/server";
import { getApiAccess } from "@/lib/auth/account";
import { probeDriveFolderForPipeline } from "@/lib/detection/drive-detection";
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

    const result = await probeDriveFolderForPipeline({
      pipelineId: id,
      userId: pipeline.userId
    });
    const fileSummary =
      result.files.length > 0
        ? result.files
            .slice(0, 5)
            .map((file) => {
              const created = file.createdTime
                ? new Date(file.createdTime).toLocaleString()
                : "unknown time";
              return `${file.name || "Untitled"} (${file.mimeType || "unknown type"}, ${created})`;
            })
            .join(" | ")
        : "No files returned by Drive.";
    const watermark = result.processedFromTime
      ? result.processedFromTime.toLocaleString()
      : "not set";

    return NextResponse.json({
      files: result.files,
      message: `Drive check for ${result.folderName}: ${fileSummary}. Watermark: ${watermark}.`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "DriveListFailed" },
      { status: 400 }
    );
  }
}
