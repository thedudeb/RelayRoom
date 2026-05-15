import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ConnectionActions } from "@/components/connections/ConnectionActions";
import { requireAppAccess } from "@/lib/auth/account";
import { getConnectionsForDemo, getConnectionsForUser } from "@/lib/data/repository";

export default async function ConnectionsPage({
  searchParams
}: {
  searchParams?: Promise<{ connected?: string; demo?: string; disconnected?: string; error?: string }>;
}) {
  const params = await searchParams;
  const access = await requireAppAccess(params);
  const connections = access.isDemo
    ? await getConnectionsForDemo()
    : await getConnectionsForUser(access.userId);

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
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Connection</th>
              <th>Account</th>
              <th>Status</th>
              <th>Scopes</th>
              <th>Used by</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {connections.map((connection) => (
              <tr key={connection.id}>
                <td>
                  <strong>{connection.label}</strong>
                  <div className="muted">{connection.kind}</div>
                </td>
                <td>{connection.accountEmail}</td>
                <td>
                  <span
                    className={`badge ${
                      connection.status === "active" ? "uploaded" : "failed"
                    }`}
                  >
                    {connection.status}
                  </span>
                </td>
                <td>{connection.scopes.join(", ")}</td>
                <td>
                  {connection.usedByPipelines.length > 0
                    ? connection.usedByPipelines.join(", ")
                    : "No pipelines"}
                </td>
                <td>
                  <div className="actions">
                    <ConnectionActions
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
