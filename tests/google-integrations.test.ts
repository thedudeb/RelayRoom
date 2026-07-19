import { afterEach, describe, expect, it } from "vitest";
import {
  areGoogleIntegrationsPaused,
  assertGoogleIntegrationsEnabled,
  GOOGLE_INTEGRATIONS_PAUSED_ERROR
} from "@/lib/google/integrations";

const originalValue = process.env.GOOGLE_INTEGRATIONS_DISABLED;

afterEach(() => {
  process.env.GOOGLE_INTEGRATIONS_DISABLED = originalValue;
});

describe("Google integration pause flag", () => {
  it("defaults to paused integrations", () => {
    delete process.env.GOOGLE_INTEGRATIONS_DISABLED;

    expect(areGoogleIntegrationsPaused()).toBe(true);
    expect(() => assertGoogleIntegrationsEnabled()).toThrow(GOOGLE_INTEGRATIONS_PAUSED_ERROR);
  });

  it("treats true-like values as paused", () => {
    process.env.GOOGLE_INTEGRATIONS_DISABLED = "true";

    expect(areGoogleIntegrationsPaused()).toBe(true);
    expect(() => assertGoogleIntegrationsEnabled()).toThrow(GOOGLE_INTEGRATIONS_PAUSED_ERROR);
  });

  it("treats false-like values as enabled", () => {
    process.env.GOOGLE_INTEGRATIONS_DISABLED = "false";

    expect(areGoogleIntegrationsPaused()).toBe(false);
    expect(() => assertGoogleIntegrationsEnabled()).not.toThrow();
  });
});
