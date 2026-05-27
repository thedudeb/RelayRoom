"use client";

import type { CSSProperties, ReactNode } from "react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function FloatingTooltip({
  children,
  label
}: {
  children: ReactNode;
  label: string;
}) {
  const tooltipId = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({
    left: 0,
    top: 0,
    visibility: "hidden"
  });

  useLayoutEffect(() => {
    if (!open) return;

    let frame = 0;

    function updatePosition() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const anchor = anchorRef.current;
        const tooltip = tooltipRef.current;
        if (!anchor || !tooltip) return;

        const anchorRect = anchor.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const gap = 8;
        const margin = 12;
        const centeredLeft = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
        const maxLeft = Math.max(margin, window.innerWidth - tooltipRect.width - margin);
        const left = clamp(centeredLeft, margin, maxLeft);
        const topAbove = anchorRect.top - tooltipRect.height - gap;
        const topBelow = anchorRect.bottom + gap;
        const top =
          topAbove >= margin
            ? topAbove
            : clamp(topBelow, margin, Math.max(margin, window.innerHeight - tooltipRect.height - margin));

        setStyle({
          left,
          top,
          visibility: "visible"
        });
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  return (
    <span
      aria-describedby={open ? tooltipId : undefined}
      className="floating-tooltip-anchor"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
      onFocus={() => setOpen(true)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      ref={anchorRef}
    >
      {children}
      {open
        ? createPortal(
            <div
              className="floating-tooltip"
              id={tooltipId}
              ref={tooltipRef}
              role="tooltip"
              style={style}
            >
              {label}
            </div>,
            document.body
          )
        : null}
    </span>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
