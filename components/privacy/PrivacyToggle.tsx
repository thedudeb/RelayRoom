"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";

// Toggles "privacy mode", which blurs/masks sensitive values (anything marked
// data-private) so the app can be screenshotted or demoed safely. State is
// mirrored onto <html data-privacy> for CSS to act on and persisted in
// localStorage; the inline script in layout.tsx applies it before first paint to
// avoid a flash.
export function PrivacyToggle({ compact = false }: { compact?: boolean }) {
  const [isPrivate, setIsPrivate] = useState(false);

  // Hydrate from localStorage on mount. Starts false to match the server render,
  // then syncs to the stored preference (avoids a hydration mismatch).
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
