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

  return allowedDomains.has(emailDomain) && allowedDomains.has(normalizedHostedDomain);
}

export function hasConfiguredSignInAllowlist() {
  return getAllowedSignInEmails().size > 0 || getAllowedSignInDomains().size > 0;
}

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

function getAllowedSignInDomains() {
  return new Set(
    (process.env.AUTH_ALLOWED_DOMAINS || "")
      .split(",")
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean)
  );
}
