"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";

export function PrivacyToggle({ compact = false }: { compact?: boolean }) {
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("privacyMode") === "on";
    setIsPrivate(stored);
    document.documentElement.dataset.privacy = stored ? "on" : "off";
  }, []);

  function togglePrivacy() {
    const next = !isPrivate;
    setIsPrivate(next);
    document.documentElement.dataset.privacy = next ? "on" : "off";
    window.localStorage.setItem("privacyMode", next ? "on" : "off");
  }

  const Icon = isPrivate ? EyeOff : Eye;

  return (
    <button
      aria-pressed={isPrivate}
      className={`button ${compact ? "icon-button" : ""}`}
      onClick={togglePrivacy}
      title={isPrivate ? "Turn privacy mode off" : "Mask private info for screenshots"}
      type="button"
    >
      <Icon aria-hidden="true" size={18} />
      {compact ? null : isPrivate ? "Privacy on" : "Privacy"}
    </button>
  );
}
