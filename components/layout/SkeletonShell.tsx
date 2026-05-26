import {
  CircleHelp,
  Eye,
  GitBranch,
  ListChecks,
  Menu,
  Moon,
  PlugZap,
  Settings
} from "lucide-react";
import { RelayRoomLogo } from "@/components/brand/RelayRoomLogo";

const navItems = [
  { href: "/dashboard", label: "Queue", icon: ListChecks },
  { href: "/pipelines", label: "Pipelines", icon: GitBranch },
  { href: "/connections", label: "Connections", icon: PlugZap },
  { href: "/settings", label: "Settings", icon: Settings }
] as const;

export function SkeletonShell({
  activeHref,
  titleWidth = 240,
  subtitleWidth = 360,
  children
}: {
  activeHref?: (typeof navItems)[number]["href"];
  titleWidth?: number;
  subtitleWidth?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      {/* Visual placeholder for the AppShell hamburger so it doesn't blink
          out of existence during route transitions on mobile. Disabled
          because the route is still loading. */}
      <button
        aria-hidden="true"
        className="mobile-menu-toggle"
        disabled
        tabIndex={-1}
        type="button"
      >
        <Menu aria-hidden="true" size={20} />
      </button>
      <aside className="sidebar">
        <div className="brand">
          <RelayRoomLogo />
          <span>Drive to YouTube operations</span>
        </div>
        <p className="sidebar-section-label">Workspace</p>
        <nav className="nav" aria-label="Loading navigation" aria-busy="true">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                aria-current={activeHref === item.href ? "page" : undefined}
                aria-disabled="true"
                data-active={activeHref === item.href}
              >
                <Icon aria-hidden="true" size={18} />
                {item.label}
              </a>
            );
          })}
        </nav>
        <div className="sidebar-utilities" aria-label="Loading workspace utilities" aria-busy="true">
          <button className="button" disabled type="button">
            <Eye aria-hidden="true" size={17} />
            Privacy
          </button>
          <button className="button" disabled type="button">
            <Moon aria-hidden="true" size={17} />
            Dark mode
          </button>
          <button className="button" disabled type="button">
            <CircleHelp aria-hidden="true" size={17} />
            Tutorial
          </button>
        </div>
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
