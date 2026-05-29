// Google APIs return errors in two shapes: OAuth token endpoints use
// `{ error: "invalid_grant", error_description }` (string), while REST APIs use
// `{ error: { code, message, status } }` (object). This module normalizes both
// into a single structured log line, deliberately omitting the human-readable
// message so we don't accidentally log tokens or other sensitive echo-backs.

type GoogleErrorPayload = {
  error?: string | { code?: number; message?: string; status?: string };
  error_description?: string;
};

/** Logs a Google API failure as a structured record (code + HTTP status only). */
export function logGoogleApiError(
  message: string,
  response: { status: number; statusText?: string },
  payload?: unknown
) {
  const googlePayload = isGoogleErrorPayload(payload) ? payload : undefined;
  const error = normalizeGoogleError(googlePayload?.error);
  console.error(message, {
    code: error.code || googlePayload?.error_description || error.status || "google_api_error",
    status: response.status,
    statusText: response.statusText || undefined
  });
}

function isGoogleErrorPayload(payload: unknown): payload is GoogleErrorPayload {
  return typeof payload === "object" && payload !== null;
}

// Collapses the string-form and object-form error variants into a common
// { code, status } shape.
function normalizeGoogleError(error: GoogleErrorPayload["error"]) {
  if (!error) {
    return {};
  }

  if (typeof error === "string") {
    return { code: error };
  }

  return {
    code: error.code,
    status: error.status
  };
}
