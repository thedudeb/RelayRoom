"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GitBranch,
  ListChecks,
  PlugZap,
  Settings,
  SlidersHorizontal
} from "lucide-react";
import { RelayRoomLogo } from "@/components/brand/RelayRoomLogo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export interface AccountSummary {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

const navItems = [
  { href: "/dashboard", label: "Queue", icon: ListChecks },
  { href: "/pipelines", label: "Pipelines", icon: GitBranch },
  { href: "/connections", label: "Connections", icon: PlugZap },
  { href: "/settings", label: "Settings", icon: Settings }
] as const;

export function AppShell({
  title,
  subtitle,
  account,
  children
}: {
  title: string;
  subtitle: string;
  account?: AccountSummary | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <RelayRoomLogo />
          <span>Drive to YouTube operations</span>
        </div>
        <nav className="nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-active={pathname.startsWith(item.href)}
              >
                <Icon aria-hidden="true" size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="topbar-actions">
            <ThemeToggle />
            <button className="button" type="button">
              <SlidersHorizontal aria-hidden="true" size={16} />
              Operator view
            </button>
            <AccountBadge account={account} />
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}

function AccountBadge({ account }: { account?: AccountSummary | null }) {
  const displayName = account?.name || account?.email || "Demo operator";
  const supportingText = account?.email || "Demo session";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "RR";

  return (
    <div className="account-badge" title={supportingText}>
      {account?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={account.image} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
      <div>
        <strong>{displayName}</strong>
        <small>{supportingText}</small>
      </div>
    </div>
  );
}
