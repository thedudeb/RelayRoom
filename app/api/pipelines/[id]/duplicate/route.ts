import { PipelineStatus, type Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
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
  if (!id) {
    return NextResponse.json({ error: "MissingPipelineFields" }, { status: 400 });
  }

  const source = await prisma.pipeline.findFirst({
    where: {
      archivedAt: null,
      id,
      userId: access.userId
    },
    select: {
      defaultDescriptionTemplate: true,
      defaultTitleTemplate: true,
      destinationChannelName: true,
      driveConnectionId: true,
      mode: true,
      name: true,
      pollingIntervalMinutes: true,
      privacyStatus: true,
      sourceFolderId: true,
      sourceFolderName: true,
      youtubeConnectionId: true,
      rules: {
        orderBy: { priority: "asc" },
        select: {
          conditionTree: true,
          descriptionTemplateOverride: true,
          name: true,
          priority: true,
          titleTemplateOverride: true,
          youtubePlaylistId: true,
          youtubePlaylistName: true
        }
      }
    }
  });

  if (!source) {
    return NextResponse.json({ error: "PipelineNotFound" }, { status: 404 });
  }

  const duplicate = await prisma.pipeline.create({
    data: {
      defaultDescriptionTemplate: source.defaultDescriptionTemplate,
      defaultTitleTemplate: source.defaultTitleTemplate,
      destinationChannelName: source.destinationChannelName,
      driveConnectionId: source.driveConnectionId,
      mode: source.mode,
      name: `Copy of ${source.name}`,
      pollingIntervalMinutes: source.pollingIntervalMinutes,
      privacyStatus: source.privacyStatus,
      processedFromTime: new Date(),
      sourceFolderId: source.sourceFolderId,
      sourceFolderName: source.sourceFolderName,
      status: PipelineStatus.DISABLED,
      userId: access.userId,
      youtubeConnectionId: source.youtubeConnectionId,
      rules: {
        create: source.rules.map((rule) => ({
          conditionTree: rule.conditionTree as Prisma.InputJsonValue,
          descriptionTemplateOverride: rule.descriptionTemplateOverride,
          name: rule.name,
          priority: rule.priority,
          titleTemplateOverride: rule.titleTemplateOverride,
          youtubePlaylistId: rule.youtubePlaylistId,
          youtubePlaylistName: rule.youtubePlaylistName
        }))
      }
    },
    select: { id: true }
  });

  revalidatePath("/dashboard");
  revalidatePath("/pipelines");
  return NextResponse.json({ duplicated: true, pipelineId: duplicate.id });
}
