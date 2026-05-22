"use client";

import { useEffect, useMemo, useState } from "react";

interface PlaylistOption {
  id: string;
  name: string;
}

interface PlaylistResponse {
  error?: string;
  playlist?: { id: string; title: string };
  playlists?: Array<{ id: string; title: string }>;
}

export function RulePlaylistSelect({
  connectionId,
  defaultValue,
  initialOptions
}: {
  connectionId: string;
  defaultValue?: string;
  initialOptions: PlaylistOption[];
}) {
  const [options, setOptions] = useState(initialOptions);
  const [value, setValue] = useState(defaultValue || playlistOptionValue(initialOptions[0]));
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"error" | "info">("info");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const selectedExists = useMemo(
    () => options.some((option) => playlistOptionValue(option) === value),
    [options, value]
  );

  useEffect(() => {
    void loadPlaylists({ quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  async function loadPlaylists({ quiet = false }: { quiet?: boolean } = {}) {
    if (!connectionId) return;
    setIsLoading(true);
    if (!quiet) setStatus(null);

    try {
      const response = await fetch(
        `/api/oauth/youtube/playlists?connectionId=${encodeURIComponent(connectionId)}`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as PlaylistResponse;
      if (!response.ok || payload.error) {
        throw new Error(playlistErrorMessage(payload.error));
      }

      const loaded = (payload.playlists || []).map((playlist) => ({
        id: playlist.id,
        name: playlist.title
      }));
      const merged = mergePlaylistOptions(options, loaded);
      setOptions(merged);
      setValue((current) =>
        current && merged.some((option) => playlistOptionValue(option) === current)
          ? current
          : playlistOptionValue(merged[0])
      );
      if (!quiet) {
        setStatusTone("info");
        setStatus(`Loaded ${loaded.length} playlist${loaded.length === 1 ? "" : "s"}.`);
      }
    } catch (error) {
      setStatusTone("error");
      setStatus(error instanceof Error ? error.message : "Unable to load playlists.");
    } finally {
      setIsLoading(false);
    }
  }

  async function createPlaylist() {
    const title = newPlaylistName.trim();
    if (!title || !connectionId) return;

    setIsCreating(true);
    setStatus(null);

    try {
      const response = await fetch(
        `/api/oauth/youtube/playlists?connectionId=${encodeURIComponent(connectionId)}`,
        {
          body: JSON.stringify({ title }),
          headers: { "Content-Type": "application/json" },
          method: "POST"
        }
      );
      const payload = (await response.json()) as PlaylistResponse;
      if (!response.ok || payload.error || !payload.playlist) {
        throw new Error(playlistErrorMessage(payload.error));
      }

      const created = { id: payload.playlist.id, name: payload.playlist.title };
      setOptions((current) => mergePlaylistOptions([created], current));
      setValue(playlistOptionValue(created));
      setNewPlaylistName("");
      setStatusTone("info");
      setStatus(`Using ${created.name}.`);
    } catch (error) {
      setStatusTone("error");
      setStatus(error instanceof Error ? error.message : "Unable to create playlist.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <label>
      <span>Route to playlist</span>
      <div className="picker-row">
        <select
          className="select"
          name="playlist"
          onChange={(event) => setValue(event.target.value)}
          required
          value={selectedExists ? value : ""}
        >
          {options.length ? (
            options.map((playlist) => (
              <option key={playlist.id} value={playlistOptionValue(playlist)}>
                {playlist.name}
              </option>
            ))
          ) : (
            <option value="">Load playlists</option>
          )}
        </select>
        <button
          className="button"
          disabled={isLoading || !connectionId}
          onClick={() => void loadPlaylists()}
          type="button"
        >
          {isLoading ? "Loading..." : "Load"}
        </button>
      </div>
      <div className="picker-row">
        <input
          className="input"
          onChange={(event) => setNewPlaylistName(event.target.value)}
          placeholder="New playlist name"
          value={newPlaylistName}
        />
        <button
          className="button"
          disabled={isCreating || !connectionId || !newPlaylistName.trim()}
          onClick={createPlaylist}
          type="button"
        >
          {isCreating ? "Creating..." : "Create"}
        </button>
      </div>
      {status ? <small className={`field-hint ${statusTone}`}>{status}</small> : null}
    </label>
  );
}

function mergePlaylistOptions(...groups: PlaylistOption[][]) {
  const seen = new Set<string>();
  const merged: PlaylistOption[] = [];

  for (const group of groups) {
    for (const option of group) {
      if (!option.id || seen.has(option.id)) continue;
      seen.add(option.id);
      merged.push(option);
    }
  }

  return merged;
}

function playlistOptionValue(option?: PlaylistOption) {
  return option ? `${encodeURIComponent(option.id)}::${encodeURIComponent(option.name)}` : "";
}

function playlistErrorMessage(error?: string) {
  const messages: Record<string, string> = {
    MissingPlaylistTitle: "Enter a playlist name first.",
    MissingTokenKey: "TOKEN_ENCRYPTION_KEY is missing.",
    MissingYouTubeConnection: "Connect YouTube before choosing a playlist.",
    PlaylistCreateFailed: "YouTube could not create the playlist.",
    TokenRefreshFailed: "Google could not refresh the YouTube token. Reconnect YouTube and try again.",
    Unauthorized: "Log in before choosing a playlist."
  };

  return messages[error || ""] || "Unable to load YouTube playlists.";
}
