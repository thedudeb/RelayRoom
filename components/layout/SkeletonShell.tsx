import { GitBranch, ListChecks, PlugZap, Settings } from "lucide-react";
import { RelayRoomLogo } from "@/components/brand/RelayRoomLogo";

const navItems = [
  { label: "Queue", icon: ListChecks },
  { label: "Pipelines", icon: GitBranch },
  { label: "Connections", icon: PlugZap },
  { label: "Settings", icon: Settings }
] as const;

export function SkeletonShell({
  titleWidth = 240,
  subtitleWidth = 360,
  children
}: {
  titleWidth?: number;
  subtitleWidth?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <RelayRoomLogo />
          <span>Drive to YouTube operations</span>
        </div>
        <nav className="nav" aria-label="Loading navigation" aria-busy="true">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <a key={item.label} aria-disabled="true">
                <Icon aria-hidden="true" size={18} />
                {item.label}
              </a>
            );
          })}
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <span className="skeleton skeleton-title" style={{ width: titleWidth }} />
            <span className="skeleton skeleton-line" style={{ width: subtitleWidth }} />
          </div>
          <div className="topbar-actions">
            <span className="skeleton skeleton-pill" aria-hidden="true" />
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
