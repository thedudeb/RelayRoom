"use client";

import { Keyboard, MousePointer2, ScanText, Sparkles, TextCursorInput } from "lucide-react";
import { useEffect, useState } from "react";

type MotionPreference = "standard" | "reduced";
type DensityPreference = "compact" | "comfortable" | "large";
type TogglePreference = "off" | "on";

interface AccessibilityPreferences {
  contrast: TogglePreference;
  density: DensityPreference;
  focus: TogglePreference;
  motion: MotionPreference;
  shortcuts: TogglePreference;
}

const defaults: AccessibilityPreferences = {
  contrast: "off",
  density: "comfortable",
  focus: "off",
  motion: "standard",
  shortcuts: "on"
};

const preferenceKeys = {
  contrast: "a11yContrast",
  density: "a11yDensity",
  focus: "a11yFocus",
  motion: "a11yMotion",
  shortcuts: "a11yShortcuts"
} as const;

export function AccessibilityPanel() {
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(defaults);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const initial = {
      contrast: readToggle("contrast"),
      density: readDensity(),
      focus: readToggle("focus"),
      motion: readMotion(prefersReducedMotion),
      shortcuts: readToggle("shortcuts", "on")
    };
    setPreferences(initial);
    applyAccessibilityPreferences(initial);
  }, []);

  function updatePreference<K extends keyof AccessibilityPreferences>(
    key: K,
    value: AccessibilityPreferences[K]
  ) {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    window.localStorage.setItem(preferenceKeys[key], value);
    applyAccessibilityPreferences(next);
    window.dispatchEvent(new CustomEvent("relayroom:a11y-preferences", { detail: next }));
  }

  function resetPreferences() {
    Object.values(preferenceKeys).forEach((key) => window.localStorage.removeItem(key));
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next: AccessibilityPreferences = {
      ...defaults,
      motion: prefersReducedMotion ? "reduced" : "standard"
    };
    setPreferences(next);
    applyAccessibilityPreferences(next);
    window.dispatchEvent(new CustomEvent("relayroom:a11y-preferences", { detail: next }));
  }

  return (
    <section className="panel" data-tour="accessibility-preferences">
      <div className="section-header">
        <div>
          <h2>Accessibility</h2>
          <p className="muted">Personal display and keyboard preferences for this browser.</p>
        </div>
      </div>
      <div className="accessibility-grid">
        <fieldset className="accessibility-control">
          <legend>
            <Sparkles aria-hidden="true" size={15} />
            Motion
          </legend>
          <label className="radio-card">
            <input
              checked={preferences.motion === "standard"}
              onChange={() => updatePreference("motion", "standard")}
              type="radio"
            />
            <span>Standard</span>
          </label>
          <label className="radio-card">
            <input
              checked={preferences.motion === "reduced"}
              onChange={() => updatePreference("motion", "reduced")}
              type="radio"
            />
            <span>Reduced</span>
          </label>
        </fieldset>

        <fieldset className="accessibility-control">
          <legend>
            <ScanText aria-hidden="true" size={15} />
            Density
          </legend>
          {(["compact", "comfortable", "large"] as const).map((density) => (
            <label className="radio-card" key={density}>
              <input
                checked={preferences.density === density}
                onChange={() => updatePreference("density", density)}
                type="radio"
              />
              <span>{density === "large" ? "Large text" : titleCase(density)}</span>
            </label>
          ))}
        </fieldset>

        <fieldset className="accessibility-control">
          <legend>
            <TextCursorInput aria-hidden="true" size={15} />
            Contrast
          </legend>
          <label className="checkbox-field compact">
            <input
              checked={preferences.contrast === "on"}
              onChange={(event) => updatePreference("contrast", event.target.checked ? "on" : "off")}
              type="checkbox"
            />
            <span>High contrast</span>
          </label>
          <label className="checkbox-field compact">
            <input
              checked={preferences.focus === "on"}
              onChange={(event) => updatePreference("focus", event.target.checked ? "on" : "off")}
              type="checkbox"
            />
            <span>Enhanced focus</span>
          </label>
        </fieldset>

        <fieldset className="accessibility-control">
          <legend>
            <Keyboard aria-hidden="true" size={15} />
            Keyboard
          </legend>
          <label className="checkbox-field compact">
            <input
              checked={preferences.shortcuts === "on"}
              onChange={(event) => updatePreference("shortcuts", event.target.checked ? "on" : "off")}
              type="checkbox"
            />
            <span>Queue shortcuts</span>
          </label>
          <div className="shortcut-list" aria-label="Queue keyboard shortcuts">
            <span><kbd>A</kbd> select visible</span>
            <span><kbd>U</kbd> approve/retry</span>
            <span><kbd>S</kbd> skip</span>
            <span><kbd>H</kbd> mark handled</span>
            <span><kbd>R</kbd> restore</span>
            <span><kbd>Esc</kbd> clear</span>
          </div>
        </fieldset>
      </div>
      <button className="button" onClick={resetPreferences} type="button">
        <MousePointer2 aria-hidden="true" size={15} />
        Reset accessibility preferences
      </button>
    </section>
  );
}

export function applyAccessibilityPreferences(preferences: AccessibilityPreferences) {
  const root = document.documentElement;
  root.dataset.a11yMotion = preferences.motion;
  root.dataset.a11yDensity = preferences.density;
  root.dataset.a11yContrast = preferences.contrast;
  root.dataset.a11yFocus = preferences.focus;
  root.dataset.a11yShortcuts = preferences.shortcuts;
}

function readToggle(
  key: "contrast" | "focus" | "shortcuts",
  fallback: TogglePreference = defaults[key]
): TogglePreference {
  return window.localStorage.getItem(preferenceKeys[key]) === "on" ? "on" : fallback;
}

function readDensity(): DensityPreference {
  const value = window.localStorage.getItem(preferenceKeys.density);
  return value === "compact" || value === "large" ? value : "comfortable";
}

function readMotion(prefersReducedMotion: boolean): MotionPreference {
  const value = window.localStorage.getItem(preferenceKeys.motion);
  if (value === "standard" || value === "reduced") return value;
  return prefersReducedMotion ? "reduced" : "standard";
}

function titleCase(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
