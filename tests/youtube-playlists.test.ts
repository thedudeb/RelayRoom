import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyChannelPlaylist } from "@/lib/oauth/youtube-playlists";

describe("YouTube playlist verification", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("verifies a playlist by comparing it with the authenticated channel", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: "channel-1" }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: "playlist-1",
              snippet: { channelId: "channel-1", title: "RelayRoom recordings" }
            }
          ]
        })
      );

    const playlist = await verifyChannelPlaylist({
      accessToken: "token",
      playlistId: "playlist-1"
    });

    expect(playlist).toEqual({ id: "playlist-1", name: "RelayRoom recordings" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(urlForCall(fetchMock, 0).searchParams.get("mine")).toBe("true");
    expect(urlForCall(fetchMock, 0).searchParams.get("id")).toBeNull();
    expect(urlForCall(fetchMock, 1).searchParams.get("id")).toBe("playlist-1");
    expect(urlForCall(fetchMock, 1).searchParams.get("mine")).toBeNull();
  });

  it("rejects playlists owned by another channel", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: "channel-1" }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [{ id: "playlist-1", snippet: { channelId: "channel-2" } }]
        })
      );

    await expect(
      verifyChannelPlaylist({ accessToken: "token", playlistId: "playlist-1" })
    ).resolves.toBeNull();
  });
});

function jsonResponse(body: unknown) {
  return {
    json: async () => body,
    ok: true
  } as Response;
}

function urlForCall(fetchMock: ReturnType<typeof vi.spyOn<typeof globalThis, "fetch">>, index: number) {
  return new URL(String(fetchMock.mock.calls[index][0]));
}
