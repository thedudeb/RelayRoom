import { afterEach, describe, expect, it } from "vitest";
import { hasConfiguredSignInAllowlist, isAllowedSignInIdentity } from "@/lib/auth/signin-allowlist";

const originalEnv = {
  AUTH_ALLOWED_DOMAINS: process.env.AUTH_ALLOWED_DOMAINS,
  AUTH_ALLOWED_EMAILS: process.env.AUTH_ALLOWED_EMAILS,
  INITIAL_ADMIN_EMAIL: process.env.INITIAL_ADMIN_EMAIL
};

afterEach(() => {
  restoreEnv("AUTH_ALLOWED_DOMAINS", originalEnv.AUTH_ALLOWED_DOMAINS);
  restoreEnv("AUTH_ALLOWED_EMAILS", originalEnv.AUTH_ALLOWED_EMAILS);
  restoreEnv("INITIAL_ADMIN_EMAIL", originalEnv.INITIAL_ADMIN_EMAIL);
});

describe("sign-in allowlist", () => {
  it("allows exact configured emails", () => {
    process.env.INITIAL_ADMIN_EMAIL = "";
    process.env.AUTH_ALLOWED_EMAILS = "owner@example.com";
    process.env.AUTH_ALLOWED_DOMAINS = "";

    expect(isAllowedSignInIdentity({ email: "OWNER@example.com" })).toBe(true);
  });

  it("allows users from configured Workspace domains when the hd claim matches", () => {
    process.env.INITIAL_ADMIN_EMAIL = "";
    process.env.AUTH_ALLOWED_EMAILS = "";
    process.env.AUTH_ALLOWED_DOMAINS = "geniusventuresinc.com, geniusinnovationlab.com";

    expect(
      isAllowedSignInIdentity({
        email: "person@geniusinnovationlab.com",
        hostedDomain: "geniusinnovationlab.com"
      })
    ).toBe(true);
  });

  it("rejects matching email domains without a Google hosted-domain claim", () => {
    process.env.INITIAL_ADMIN_EMAIL = "";
    process.env.AUTH_ALLOWED_EMAILS = "";
    process.env.AUTH_ALLOWED_DOMAINS = "geniusventuresinc.com";

    expect(isAllowedSignInIdentity({ email: "person@geniusventuresinc.com" })).toBe(false);
  });

  it("rejects hosted-domain mismatches", () => {
    process.env.INITIAL_ADMIN_EMAIL = "";
    process.env.AUTH_ALLOWED_EMAILS = "";
    process.env.AUTH_ALLOWED_DOMAINS = "geniusventuresinc.com";

    expect(
      isAllowedSignInIdentity({
        email: "person@geniusventuresinc.com",
        hostedDomain: "other.example"
      })
    ).toBe(false);
  });

  it("reports whether an email or domain allowlist is configured", () => {
    process.env.INITIAL_ADMIN_EMAIL = "";
    process.env.AUTH_ALLOWED_EMAILS = "";
    process.env.AUTH_ALLOWED_DOMAINS = "";
    expect(hasConfiguredSignInAllowlist()).toBe(false);

    process.env.AUTH_ALLOWED_DOMAINS = "geniusventuresinc.com";
    expect(hasConfiguredSignInAllowlist()).toBe(true);
  });
});

function restoreEnv(name: keyof NodeJS.ProcessEnv, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
