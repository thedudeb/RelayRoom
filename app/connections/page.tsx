import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/empty/EmptyState";
import { ConnectionActions } from "@/components/connections/ConnectionActions";
import { WorkspaceUserFilter } from "@/components/workspace/WorkspaceUserFilter";
import { FloatingTooltip } from "@/components/ui/FloatingTooltip";
import { requireAppAccess } from "@/lib/auth/account";
import {
  getConnectionsForDemo,
  getConnectionsForUser,
  getWorkspaceUsers
} from "@/lib/data/repository";
import {
  areGoogleIntegrationsPaused,
  GOOGLE_INTEGRATIONS_PAUSED_ERROR,
  GOOGLE_INTEGRATIONS_PAUSED_MESSAGE
} from "@/lib/google/integrations";
import { displayWorkspaceUser, selectedWorkspaceUserId } from "@/lib/workspace/users";

export default async function ConnectionsPage({
  searchParams
}: {
  searchParams?: Promise<{
    connected?: string;
    demo?: string;
    disconnected?: string;
    error?: string;
    userId?: string;
  }>;
}) {
  const params = await searchParams;
  const access = await requireAppAccess(params);
  const workspaceUsers = access.isDemo ? [] : await getWorkspaceUsers();
  const selectedUserId = selectedWorkspaceUserId(params?.userId, workspaceUsers);
  const connections = access.isDemo
    ? await getConnectionsForDemo()
    : await getConnectionsForUser(access.userId, { userId: selectedUserId });

  // The viewer's own active connections, used to relabel the connect buttons
  // (you can still add a second Drive or YouTube channel — SPEC §4.2 —
  // so we don't disable the buttons, just signal "you already have one").
  const ownedActive = (kind: "drive" | "youtube") =>
    !access.isDemo &&
    connections.some(
      (c) => c.kind === kind && c.owner.id === access.userId && c.status === "active"
    );
  const hasDrive = ownedActive("drive");
  const hasYouTube = ownedActive("youtube");
  const googleIntegrationsPaused = areGoogleIntegrationsPaused();

  return (
    <AppShell
      title="Connections"
      subtitle="Separate OAuth grants for sign-in, Drive sources, and YouTube destinations."
      account={access.account}
      isDemo={access.isDemo}
    >
      <div className="section-header" data-tour="connection-actions">
        <div className="actions">
          {access.isDemo || googleIntegrationsPaused ? (
            <>
              <button className="button primary" disabled type="button">Connect Drive</button>
              <button className="button" disabled type="button">Connect YouTube</button>
            </>
          ) : (
            <>
              <Link
                className={hasDrive ? "button" : "button primary"}
                data-tooltip={hasDrive ? "You already have a Drive connection — add another account" : undefined}
                href="/api/oauth/drive/start"
              >
                {hasDrive ? "Connect another Drive" : "Connect Drive"}
              </Link>
              <Link
                className="button"
                data-tooltip={hasYouTube ? "You already have a YouTube connection — add another channel" : undefined}
                href="/api/oauth/youtube/start"
              >
                {hasYouTube ? "Connect another YouTube" : "Connect YouTube"}
              </Link>
            </>
          )}
        </div>
      </div>
      {googleIntegrationsPaused ? (
        <div className="notice" role="status">
          {GOOGLE_INTEGRATIONS_PAUSED_MESSAGE} Existing connections stay visible, but connect and
          reconnect are disabled.
        </div>
      ) : null}
      {params?.connected ? (
        <div className="notice success" role="status">
          Connection saved. RelayRoom can now use this account in pipelines.
        </div>
      ) : null}
      {params?.disconnected ? (
        <div className="notice success" role="status">
          Connection disconnected. Dependent pipelines were paused until you reconnect.
        </div>
      ) : null}
      {params?.error ? (
        <div className="notice danger" role="alert">
          {connectionErrorMessage(params.error)}
        </div>
      ) : null}
      <WorkspaceUserFilter
        currentUserId={access.isDemo ? undefined : access.userId}
        selectedUserId={selectedUserId}
        selfLabel="My connections"
        title="Connection owner"
        users={workspaceUsers}
      />
      <div className="table-wrap responsive-table-wrap tooltip-overflow-wrap" data-tour="connection-table">
        <table className="responsive-table">
          <thead>
            <tr>
              <th>Connection</th>
              <th>Account</th>
              <th>Connected by</th>
              <th>Status</th>
              <th>Scopes</th>
              <th>Used by</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {connections.map((connection) => (
              <tr key={connection.id}>
                <td data-label="Connection">
                  <strong data-private>{connection.label}</strong>
                  <div className="muted">{connection.kind}</div>
                </td>
                <td data-label="Account"><span data-private>{connection.accountEmail}</span></td>
                <td data-label="Connected by">
                  <span data-private>{displayWorkspaceUser(connection.owner)}</span>
                  <div className="muted" data-private>{connection.owner.email}</div>
                </td>
                <td data-label="Status">
                  <FloatingTooltip label={connectionStatusTooltip(connection)}>
                    <span
                      aria-label={connectionStatusTooltip(connection)}
                      className={`badge ${
                        connection.status === "active" ? "uploaded" : "failed"
                      }`}
                      tabIndex={0}
                    >
                      {connection.status}
                    </span>
                  </FloatingTooltip>
                </td>
                <td data-label="Scopes">{connection.scopes.join(", ")}</td>
                <td data-label="Used by">
                  {connection.usedByPipelines.length > 0
                    ? <span data-private>{connection.usedByPipelines.join(", ")}</span>
                    : "No pipelines"}
                </td>
                <td data-label="Actions">
                  <div className="actions">
                    <ConnectionActions
                      canManage={!access.isDemo && connection.owner.id === access.userId}
                      connectionId={connection.id}
                      googleIntegrationsPaused={googleIntegrationsPaused}
                      kind={connection.kind}
                      label={connection.label}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {connections.length === 0 ? (
          <EmptyState
            illustration="connection"
            title="No accounts connected yet"
            body="Link Drive and YouTube to begin routing recordings. You can use separate accounts for source and destination."
          />
        ) : null}
      </div>
    </AppShell>
  );
}

function connectionStatusTooltip(connection: {
  errorMessage?: string;
  expiresAt?: string;
  status: "active" | "expired" | "errored";
}) {
  if (connection.status === "errored") {
    return connection.errorMessage
      ? `Errored: ${connection.errorMessage}`
      : "Errored. Reconnect this account to resume dependent pipelines.";
  }

  if (connection.status === "expired") {
    return connection.expiresAt
      ? `Expired ${formatConnectionDate(connection.expiresAt)}. Reconnect this account to refresh access.`
      : "Expired. Reconnect this account to refresh access.";
  }

  return connection.expiresAt
    ? `Active. Current access token expires ${formatConnectionDate(connection.expiresAt)} and refreshes silently.`
    : "Active. RelayRoom can use this connection.";
}

function formatConnectionDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(isoDate));
}

function connectionErrorMessage(error: string) {
  const messages: Record<string, string> = {
    InvalidOAuthState: "The OAuth session expired. Please try connecting again.",
    [GOOGLE_INTEGRATIONS_PAUSED_ERROR]:
      "Google Drive and YouTube integrations are paused for this deployment.",
    MissingGOOGLE_DRIVEConfig: "Drive OAuth is not configured yet. Add the Drive client ID and secret.",
    MissingGOOGLE_YOUTUBEConfig:
      "YouTube OAuth is not configured yet. Add the YouTube client ID and secret.",
    MissingRefreshToken:
      "Google did not return a refresh token. Remove RelayRoom from your Google account permissions, then connect again.",
    MissingTokenKey: "TOKEN_ENCRYPTION_KEY is missing. Add it before saving OAuth tokens.",
    TokenExchangeFailed: "Google did not accept the OAuth code. Please try again.",
    ConnectionCallbackFailed:
      "Saving the connection failed on the server. Check Vercel logs for the underlying error (often a missing migration or env var)."
  };

  return messages[error] || `Connection failed: ${error}`;
}
