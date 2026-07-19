import { NextResponse } from "next/server";

export const GOOGLE_INTEGRATIONS_PAUSED_ERROR = "GoogleIntegrationsPaused";
export const GOOGLE_INTEGRATIONS_PAUSED_MESSAGE =
  "Google Drive and YouTube integrations are paused for this deployment.";

const falseValues = new Set(["0", "false", "no", "off"]);

export function areGoogleIntegrationsPaused() {
  const value = process.env.GOOGLE_INTEGRATIONS_DISABLED || "";
  return !falseValues.has(value.trim().toLowerCase());
}

export function assertGoogleIntegrationsEnabled() {
  if (areGoogleIntegrationsPaused()) {
    throw new Error(GOOGLE_INTEGRATIONS_PAUSED_ERROR);
  }
}

export function googleIntegrationsPausedResponse(status = 503) {
  return NextResponse.json(
    {
      error: GOOGLE_INTEGRATIONS_PAUSED_ERROR,
      message: GOOGLE_INTEGRATIONS_PAUSED_MESSAGE
    },
    { status }
  );
}
