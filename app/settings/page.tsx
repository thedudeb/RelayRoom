import { AppShell } from "@/components/layout/AppShell";
import { getCurrentAccount } from "@/lib/auth/account";

export default async function SettingsPage() {
  const account = await getCurrentAccount();

  return (
    <AppShell
      title="Settings"
      subtitle="Timezone, API access, and platform-owner account controls."
      account={account}
    >
      <div className="split">
        <section className="panel">
          <h2>Profile</h2>
          <div className="stack">
            <label className="stack">
              <span>Timezone</span>
              <select className="select" defaultValue="America/Halifax">
                <option value="America/Halifax">America/Halifax</option>
                <option value="America/New_York">America/New_York</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
              </select>
            </label>
            <label className="stack">
              <span>Read-only API key</span>
              <input
                className="input"
                readOnly
                value="rpp_live_demo_redacted_9b6c"
                aria-label="Read-only API key"
              />
            </label>
            <button className="button" type="button">Rotate API key</button>
          </div>
        </section>
        <section className="panel">
          <h2>Owner Controls</h2>
          <p className="muted">
            The first matching INITIAL_ADMIN_EMAIL account can disable or remove users, but
            cannot view their private connections, pipelines, or queue items.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>operator@example.com</td>
                  <td><span className="badge uploaded">active</span></td>
                  <td><button className="button danger" type="button">Disable</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
