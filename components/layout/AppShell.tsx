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

const navItems = [
  { href: "/dashboard", label: "Queue", icon: ListChecks },
  { href: "/pipelines", label: "Pipelines", icon: GitBranch },
  { href: "/connections", label: "Connections", icon: PlugZap },
  { href: "/settings", label: "Settings", icon: Settings }
] as const;

export function AppShell({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
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
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
