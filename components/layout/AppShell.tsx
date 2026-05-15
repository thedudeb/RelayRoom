"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  GitBranch,
  ListChecks,
  LogOut,
  PlugZap,
  Settings
} from "lucide-react";
import { RelayRoomLogo } from "@/components/brand/RelayRoomLogo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { signOutFromApp } from "@/lib/auth/actions";

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
  isDemo = false,
  children
}: {
  title: string;
  subtitle: string;
  account?: AccountSummary | null;
  isDemo?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const demoSuffix = isDemo ? "?demo=true" : "";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href={`/dashboard${demoSuffix}`}>
          <RelayRoomLogo />
          <span>Drive to YouTube operations</span>
        </Link>
        <nav className="nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={`${item.href}${demoSuffix}`}
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
    <details className="account-menu">
      <summary className="account-badge" title={supportingText}>
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
        <ChevronDown aria-hidden="true" size={15} />
      </summary>
      <div className="account-menu-panel">
        <div className="account-menu-identity">
          <strong>{displayName}</strong>
          <span>{supportingText}</span>
        </div>
        {account ? (
          <form action={signOutFromApp}>
            <button className="account-menu-item" type="submit">
              <LogOut aria-hidden="true" size={15} />
              Sign out
            </button>
          </form>
        ) : (
          <Link className="account-menu-item" href="/">
            Sign in with Google
          </Link>
        )}
      </div>
    </details>
  );
}
