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
  isDemo: false,
  userId: "owner-user"
};

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
});
