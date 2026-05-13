import { AppShell } from "@/components/layout/AppShell";
import { getConnectionsForDemo } from "@/lib/data/repository";

export default async function ConnectionsPage() {
  const connections = await getConnectionsForDemo();

  return (
    <AppShell
      title="Connections"
      subtitle="Separate OAuth grants for sign-in, Drive sources, and YouTube destinations."
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
      </div>
    </AppShell>
  );
}
