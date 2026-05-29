// Gatekeeper for who may sign in, driven entirely by env-configured allowlists.
// Two independent mechanisms: an exact email allowlist and a domain allowlist.
// Domain checks require BOTH the email's domain and the Google-asserted hosted
// domain to match, so a personal gmail account can't slip through by claiming a
// corporate address.

/**
 * Returns true when the identity is permitted to sign in. An exact email match
 * passes immediately; otherwise the email's domain and the OAuth `hostedDomain`
 * claim must both appear in the domain allowlist.
 */
export function isAllowedSignInIdentity({
  email,
  hostedDomain
}: {
  email?: string | null;
  hostedDomain?: string | null;
}) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) {
    return false;
  }

  const allowedEmails = getAllowedSignInEmails();
  if (allowedEmails.has(normalizedEmail)) {
    return true;
  }

  const allowedDomains = getAllowedSignInDomains();
  if (allowedDomains.size === 0) {
    return false;
  }

  const emailDomain = normalizedEmail.split("@").at(1);
  const normalizedHostedDomain = hostedDomain?.trim().toLowerCase();
  if (!emailDomain || !normalizedHostedDomain) {
    return false;
  }

  // Require both signals to agree: the hosted domain (asserted by Google for
  // Workspace accounts) guards against a spoofed email-domain claim.
  return allowedDomains.has(emailDomain) && allowedDomains.has(normalizedHostedDomain);
}

/** True when any allowlist is configured; lets callers fail closed when neither is set. */
export function hasConfiguredSignInAllowlist() {
  return getAllowedSignInEmails().size > 0 || getAllowedSignInDomains().size > 0;
}

// Builds the exact-email allowlist from env. The initial admin is always
// included so the very first deploy has at least one account that can sign in.
function getAllowedSignInEmails() {
  const configuredEmails = [
    process.env.INITIAL_ADMIN_EMAIL,
    ...(process.env.AUTH_ALLOWED_EMAILS || "").split(",")
  ];

  return new Set(
    configuredEmails
      .map((email) => email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email))
  );
}

// Builds the domain allowlist (comma-separated AUTH_ALLOWED_DOMAINS).
function getAllowedSignInDomains() {
  return new Set(
    (process.env.AUTH_ALLOWED_DOMAINS || "")
      .split(",")
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean)
  );
}
