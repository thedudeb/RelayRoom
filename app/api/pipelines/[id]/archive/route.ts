import { PipelineStatus } from "@prisma/client";
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
