import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getApiAccess } from "@/lib/auth/account";
import { getPipelinesForUser, getQueueItemsForUser } from "@/lib/data/repository";
import { GET as getPipelines } from "@/app/api/pipelines/route";
import { GET as getQueue } from "@/app/api/queue/route";

vi.mock("@/lib/auth/account", () => ({
  getApiAccess: vi.fn()
}));

vi.mock("@/lib/data/repository", () => ({
  getPipelinesForDemo: vi.fn(),
  getPipelinesForUser: vi.fn(),
  getQueueItemsForDemo: vi.fn(),
  getQueueItemsForUser: vi.fn()
}));

const access = {
  account: { email: "owner@example.com", image: null, name: "Owner" },
  authMethod: "api_key",
  isDemo: false,
  userId: "owner-user"
} as const;

describe("read-only API scoping", () => {
  beforeEach(() => {
    vi.mocked(getApiAccess).mockResolvedValue(access);
    vi.mocked(getPipelinesForUser).mockResolvedValue([]);
    vi.mocked(getQueueItemsForUser).mockResolvedValue([]);
  });

  it("ignores userId query overrides on the queue endpoint", async () => {
    await getQueue(new NextRequest("http://localhost:3000/api/queue?userId=victim-user"));

    expect(getQueueItemsForUser).toHaveBeenCalledWith("owner-user", {
      userId: "owner-user"
    });
  });

  it("ignores userId query overrides on the pipelines endpoint", async () => {
    await getPipelines(new NextRequest("http://localhost:3000/api/pipelines?userId=victim-user"));

    expect(getPipelinesForUser).toHaveBeenCalledWith("owner-user", {
      userId: "owner-user"
    });
    expect(getQueueItemsForUser).toHaveBeenCalledWith("owner-user", {
      userId: "owner-user"
    });
  });

  it("filters queue items by detected date range", async () => {
    vi.mocked(getQueueItemsForUser).mockResolvedValue([
      {
        detectedAt: "2026-05-01T12:00:00.000Z",
        id: "old-item",
        pipelineId: "pipeline-1",
        status: "needs_approval"
      },
      {
        detectedAt: "2026-05-18T12:00:00.000Z",
        id: "new-item",
        pipelineId: "pipeline-1",
        status: "needs_approval"
      }
    ] as never);

    const response = await getQueue(
      new NextRequest(
        "http://localhost:3000/api/queue?detectedFrom=2026-05-10T00:00:00.000Z&detectedTo=2026-05-20T00:00:00.000Z"
      )
    );
    const payload = await response.json();

    expect(payload.items.map((item: { id: string }) => item.id)).toEqual(["new-item"]);
  });

  it("rejects invalid queue date filters", async () => {
    const response = await getQueue(
      new NextRequest("http://localhost:3000/api/queue?detectedFrom=not-a-date")
    );

    expect(response.status).toBe(400);
  });
});
