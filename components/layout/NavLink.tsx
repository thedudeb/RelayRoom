"use client";

import Link, { type LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

type NavLinkProps = LinkProps<string> &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps<string>> & {
    children: ReactNode;
  };

export function NavLink({ children, onClick, ...rest }: NavLinkProps) {
  const router = useRouter();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.button !== 0) return;

    const doc = document as Document & {
      startViewTransition?: (callback: () => void) => unknown;
    };
    if (typeof doc.startViewTransition !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    event.preventDefault();
    const href = (typeof rest.href === "string" ? rest.href : rest.href.toString()) as Parameters<
      typeof router.push
    >[0];
    doc.startViewTransition(() => {
      router.push(href);
    });
  }

  return (
    <Link {...rest} onClick={handleClick}>
      {children}
    </Link>
  );
}
