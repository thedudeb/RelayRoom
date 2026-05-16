import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ConnectionActions } from "@/components/connections/ConnectionActions";
import { WorkspaceUserFilter } from "@/components/workspace/WorkspaceUserFilter";
import { requireAppAccess } from "@/lib/auth/account";
import {
  getConnectionsForDemo,
  getConnectionsForUser,
  getWorkspaceUsers
} from "@/lib/data/repository";
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

  return (
    <AppShell
      title="Connections"
      subtitle="Separate OAuth grants for sign-in, Drive sources, and YouTube destinations."
      account={access.account}
      isDemo={access.isDemo}
    >
      <div className="section-header">
        <div className="actions">
          {access.isDemo ? (
            <>
              <button className="button primary" disabled type="button">Connect Drive</button>
              <button className="button" disabled type="button">Connect YouTube</button>
            </>
          ) : (
            <>
              <Link className="button primary" href="/api/oauth/drive/start">
                Connect Drive
              </Link>
              <Link className="button" href="/api/oauth/youtube/start">
                Connect YouTube
              </Link>
            </>
          )}
        </div>
      </div>
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
      <div className="table-wrap responsive-table-wrap">
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
                  <span
                    className={`badge ${
                      connection.status === "active" ? "uploaded" : "failed"
                    }`}
                  >
                    {connection.status}
                  </span>
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
          <div className="empty-state">
            <strong>No connections yet.</strong>
            <p>Connect Drive and YouTube accounts to start building real pipelines.</p>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function connectionErrorMessage(error: string) {
  const messages: Record<string, string> = {
    InvalidOAuthState: "The OAuth session expired. Please try connecting again.",
    MissingGOOGLE_DRIVEConfig: "Drive OAuth is not configured yet. Add the Drive client ID and secret.",
    MissingGOOGLE_YOUTUBEConfig:
      "YouTube OAuth is not configured yet. Add the YouTube client ID and secret.",
    MissingRefreshToken:
      "Google did not return a refresh token. Remove RelayRoom from your Google account permissions, then connect again.",
    MissingTokenKey: "TOKEN_ENCRYPTION_KEY is missing. Add it before saving OAuth tokens.",
    TokenExchangeFailed: "Google did not accept the OAuth code. Please try again."
  };

  return messages[error] || `Connection failed: ${error}`;
}
