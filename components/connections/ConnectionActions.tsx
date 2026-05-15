"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ConnectionKind } from "@/lib/domain/types";

interface DisconnectResponse {
  error?: string;
}

export function ConnectionActions({
  connectionId,
  kind,
  label
}: {
  connectionId: string;
  kind: ConnectionKind;
  label: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"danger" | "success">("success");
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  async function disconnect() {
    if (
      !window.confirm(
        `Disconnect ${label}? RelayRoom will revoke this Google grant and pause pipelines that depend on it.`
      )
    ) {
      return;
    }

    setIsDisconnecting(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/connections/${connectionId}/disconnect`, {
        method: "POST"
      });
      const payload = (await response.json().catch(() => ({}))) as DisconnectResponse;

      if (!response.ok || payload.error) {
        throw new Error(connectionErrorMessage(payload.error));
      }

      setTone("success");
      setMessage("Connection disconnected. Dependent pipelines were paused.");
      router.refresh();
    } catch (error) {
      setTone("danger");
      setMessage(error instanceof Error ? error.message : "Disconnect failed.");
    } finally {
      setIsDisconnecting(false);
    }
  }

  return (
    <>
      <Link
        className="button"
        href={kind === "drive" ? "/api/oauth/drive/start" : "/api/oauth/youtube/start"}
      >
        Reconnect
      </Link>
      <button
        className="button danger"
        disabled={isDisconnecting}
        onClick={disconnect}
        type="button"
      >
        {isDisconnecting ? "Disconnecting..." : "Disconnect"}
      </button>
      {message ? (
        <div className={`notice inline ${tone}`} role={tone === "danger" ? "alert" : "status"}>
          {message}
        </div>
      ) : null}
    </>
  );
}

function connectionErrorMessage(error?: string) {
  const messages: Record<string, string> = {
    ConnectionNotFound: "Connection not found.",
    DisconnectFailed: "Google could not revoke the token. Please try again.",
    MissingTokenKey: "TOKEN_ENCRYPTION_KEY is missing.",
    Unauthorized: "Log in before disconnecting a connection."
  };

  return messages[error || ""] || `Connection failed: ${error || "Unknown error"}`;
}
