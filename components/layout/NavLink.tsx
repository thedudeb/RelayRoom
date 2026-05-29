"use client";

import Link, { type LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

type NavLinkProps = LinkProps<string> &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps<string>> & {
    children: ReactNode;
  };

// A next/link wrapper that routes through the View Transitions API for an
// animated page swap, falling back to a normal navigation when it can't.
export function NavLink({ children, onClick, ...rest }: NavLinkProps) {
  const router = useRouter();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    // Run the caller's onClick synchronously so any defaultPrevented it sets is
    // visible before we decide whether to intercept.
    flushSync(() => {
      onClick?.(event);
    });
    // Defer to the browser's default for: already-handled clicks, modifier/
    // middle clicks (open-in-new-tab etc.), and right clicks.
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.button !== 0) return;

    const doc = document as Document & {
      startViewTransition?: (callback: () => void) => unknown;
    };
    // No transition when unsupported or when the user prefers reduced motion —
    // fall through to Link's normal navigation.
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
