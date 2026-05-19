type GoogleErrorPayload = {
  error?: string | { code?: number; message?: string; status?: string };
  error_description?: string;
};

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
