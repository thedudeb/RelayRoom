import { AppShell } from "@/components/layout/AppShell";
import { requireAppAccess } from "@/lib/auth/account";
import { getConnectionsForDemo, getConnectionsForUser } from "@/lib/data/repository";

export default async function ConnectionsPage({
  searchParams
}: {
  searchParams?: Promise<{ demo?: string }>;
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
          <button className="button primary" type="button">Connect Drive</button>
          <button className="button" type="button">Connect YouTube</button>
        </div>
      </div>
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
                    <button className="button" type="button">Reconnect</button>
                    <button className="button danger" type="button">Disconnect</button>
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
