"use client";

import { useMemo, useState } from "react";

interface ConnectionOption {
  id: string;
  label: string;
  detail: string;
}

interface PlaylistOption {
  id: string;
  title: string;
}

interface PlaylistResponse {
  error?: string;
  playlist?: PlaylistOption;
  playlists?: PlaylistOption[];
}

export function YouTubePlaylistPicker({
  disabled,
  youtubeConnections
}: {
  disabled: boolean;
  youtubeConnections: ConnectionOption[];
}) {
  const [connectionId, setConnectionId] = useState(youtubeConnections[0]?.id || "");
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([]);
  const [playlistId, setPlaylistId] = useState("");
  const [playlistName, setPlaylistName] = useState("");
  const [newPlaylistName, setNewPlaylistName] = useState("RelayRoom recordings");
  const [status, setStatus] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"error" | "info">("info");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const selectedConnection = useMemo(
    () => youtubeConnections.find((connection) => connection.id === connectionId),
    [connectionId, youtubeConnections]
  );

  async function loadPlaylists() {
    if (!connectionId || disabled) {
      return;
    }

    setIsLoading(true);
    setStatus(null);

    try {
      const response = await fetch(
        `/api/oauth/youtube/playlists?connectionId=${encodeURIComponent(connectionId)}`,
        { cache: "no-store" }
      );
        const payload = (await response.json()) as PlaylistResponse;
        if (!response.ok || payload.error) {
          throw new Error(playlistErrorMessage(payload.error));
        }

      const items = payload.playlists || [];
      setPlaylists(items);
      const firstPlaylist = items[0];
      setPlaylistId(firstPlaylist?.id || "");
      setPlaylistName(firstPlaylist?.title || "");
      setStatusTone("info");
      setStatus(
        firstPlaylist
          ? `Loaded ${items.length} playlist${items.length === 1 ? "" : "s"}.`
          : "No playlists found. Create one for this pipeline."
      );
    } catch (error) {
      setPlaylists([]);
      setPlaylistId("");
      setPlaylistName("");
      setStatusTone("error");
      setStatus(error instanceof Error ? error.message : "Unable to load playlists.");
    } finally {
      setIsLoading(false);
    }
  }

  async function createPlaylist() {
    const title = newPlaylistName.trim();
    if (!title) {
      setStatusTone("error");
      setStatus("Enter a playlist name first.");
      return;
    }

    const existingPlaylist = playlists.find(
      (playlist) => playlist.title.trim().toLowerCase() === title.toLowerCase()
    );
    if (existingPlaylist) {
      setPlaylistId(existingPlaylist.id);
      setPlaylistName(existingPlaylist.title);
      setStatusTone("info");
      setStatus(`Using existing ${existingPlaylist.title}.`);
      return;
    }

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

      setPlaylists((current) => [payload.playlist as PlaylistOption, ...current]);
      setPlaylistId(payload.playlist.id);
      setPlaylistName(payload.playlist.title);
      setStatusTone("info");
      setStatus(`Created ${payload.playlist.title}.`);
    } catch (error) {
      setStatusTone("error");
      setStatus(error instanceof Error ? error.message : "Unable to create playlist.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <>
      <label>
        <span>YouTube connection</span>
        <select
          className="select"
          data-private
          disabled={disabled}
          name="youtubeConnectionId"
          onChange={(event) => {
            setConnectionId(event.target.value);
            setPlaylists([]);
            setPlaylistId("");
            setPlaylistName("");
            setStatus(null);
          }}
          required
          value={connectionId}
        >
          {youtubeConnections.map((connection) => (
            <option key={connection.id} value={connection.id}>
              {connection.label} - {connection.detail}
            </option>
          ))}
        </select>
        {selectedConnection ? (
          <small className="field-hint">Using <span data-private>{selectedConnection.detail}</span>.</small>
        ) : null}
      </label>
      <label>
        <span>YouTube playlist</span>
        <div className="picker-row">
          <select
            className="select"
            data-private={playlistId ? true : undefined}
            disabled={disabled || isLoading || playlists.length === 0}
            onChange={(event) => {
              const selected = playlists.find((playlist) => playlist.id === event.target.value);
              setPlaylistId(selected?.id || "");
              setPlaylistName(selected?.title || "");
            }}
            value={playlistId}
          >
            {playlists.length ? (
              playlists.map((playlist) => (
                <option key={playlist.id} value={playlist.id}>
                  {playlist.title}
                </option>
              ))
            ) : (
              <option value="">Load playlists</option>
            )}
          </select>
          <button
            className="button"
            disabled={disabled || isLoading || !connectionId}
            onClick={loadPlaylists}
            type="button"
          >
            {isLoading ? "Loading..." : "Load"}
          </button>
        </div>
        <input name="youtubePlaylistId" type="hidden" value={playlistId} />
        <input name="youtubePlaylistName" type="hidden" value={playlistName} />
        {status ? <small className={`field-hint ${statusTone}`}>{status}</small> : null}
      </label>
      <label>
        <span>Create playlist</span>
        <div className="picker-row">
          <input
            className="input"
            data-private
            disabled={disabled || isCreating}
            onChange={(event) => setNewPlaylistName(event.target.value)}
            value={newPlaylistName}
          />
          <button
            className="button"
            disabled={disabled || isCreating || !connectionId}
            onClick={createPlaylist}
            type="button"
          >
            {isCreating ? "Creating..." : "Create"}
          </button>
        </div>
        <small className="field-hint">New playlists start private on YouTube.</small>
      </label>
    </>
  );
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
