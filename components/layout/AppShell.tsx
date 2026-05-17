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
import { useEffect, useRef, useState } from "react";
import { RelayRoomLogo } from "@/components/brand/RelayRoomLogo";
import { PrivacyToggle } from "@/components/privacy/PrivacyToggle";
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
        <div className="sidebar-utilities" aria-label="Workspace utilities">
          <PrivacyToggle />
          <ThemeToggle />
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="topbar-actions">
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current) return;
      if (event.target instanceof Node && rootRef.current.contains(event.target)) return;
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={rootRef} data-open={open}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="account-badge"
        onClick={() => setOpen((value) => !value)}
        title={supportingText}
        type="button"
      >
        {account?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img data-private src={account.image} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span aria-hidden="true" data-private>{initials}</span>
        )}
        <div>
          <strong data-private>{displayName}</strong>
          <small data-private>{supportingText}</small>
        </div>
        <ChevronDown aria-hidden="true" className="account-badge-chevron" size={15} />
      </button>
      {open ? (
        <div className="account-menu-panel" role="menu">
          <div className="account-menu-identity">
            <strong data-private>{displayName}</strong>
            <span data-private>{supportingText}</span>
          </div>
          {account ? (
            <form action={signOutFromApp}>
              <button className="account-menu-item" type="submit" role="menuitem">
                <LogOut aria-hidden="true" size={15} />
                Sign out
              </button>
            </form>
          ) : (
            <Link className="account-menu-item" href="/" role="menuitem">
              Sign in with Google
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}
