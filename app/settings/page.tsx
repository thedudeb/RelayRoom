import { ConnectionKind, ConnectionStatus, PipelineStatus, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ApiKeyPanel } from "@/components/settings/ApiKeyPanel";
import { WebhookSmokeTest } from "@/components/settings/WebhookSmokeTest";
import { requireAppAccess, requireOwnerAccess } from "@/lib/auth/account";
import { prisma } from "@/lib/db/prisma";

export default async function SettingsPage({
  searchParams
}: {
  searchParams?: Promise<{
    demo?: string;
    error?: string;
    userEnabled?: string;
    userDisabled?: string;
    userRemoved?: string;
  }>;
}) {
  const params = await searchParams;
  const access = await requireAppAccess(params);
  const [ownerState, readiness, activeApiKey] = access.isDemo
    ? [null, await getReadinessState(), null]
    : await Promise.all([
        getOwnerState(access.userId),
        getReadinessState(),
        getActiveApiKey(access.userId)
      ]);

  return (
    <AppShell
      title="Settings"
      subtitle="Timezone, API access, and platform-owner account controls."
      account={access.account}
      isDemo={access.isDemo}
    >
      {params?.userEnabled ? (
        <div className="notice success" role="status">
          User enabled.
        </div>
      ) : null}
      {params?.userDisabled ? (
        <div className="notice success" role="status">
          User disabled.
        </div>
      ) : null}
      {params?.userRemoved ? (
        <div className="notice success" role="status">
          User removed.
        </div>
      ) : null}
      {params?.error ? (
        <div className="notice danger" role="alert">
          {settingsErrorMessage(params.error)}
        </div>
      ) : null}
      <div className="split">
        <section className="stack">
          <ReadinessPanel readiness={readiness} />
          <WebhookSmokeTest disabled={access.isDemo} />
          <section className="panel" data-tour="api-key-panel">
            <h2>Profile</h2>
            <div className="stack">
              <label className="stack">
                <span>Timezone</span>
                <select className="select" defaultValue="America/Halifax">
                  <option value="America/Halifax">America/Halifax</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="America/Los_Angeles">America/Los_Angeles</option>
                </select>
              </label>
              <ApiKeyPanel activeKey={activeApiKey} />
            </div>
          </section>
        </section>
        <section className="stack">
          <section className="panel" data-tour="owner-controls">
            <h2>Owner Controls</h2>
            <p className="muted">
              The first matching INITIAL_ADMIN_EMAIL account can disable or remove users. Workspace
              connections, pipelines, and queue items are visible to allowed users; OAuth tokens
              stay encrypted and hidden.
            </p>
            {ownerState?.isOwner ? (
              <UserManagementTable currentUserId={access.userId} users={ownerState.users} />
            ) : (
              <div className="empty-state compact">
                <strong>Owner-only area</strong>
                <p>Only the platform owner can manage user access.</p>
              </div>
            )}
          </section>
        </section>
      </div>
    </AppShell>
  );
}

async function getActiveApiKey(userId: string) {
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      revokedAt: null,
      userId
    },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      lastUsedAt: true,
      name: true
    }
  });

  if (!apiKey) {
    return null;
  }

  return {
    createdAt: apiKey.createdAt.toLocaleString(),
    lastUsedAt: apiKey.lastUsedAt?.toLocaleString() || null,
    name: apiKey.name
  };
}

type ReadinessTone = "attention" | "missing" | "ready";

interface ReadinessCheck {
  detail: string;
  label: string;
  status: ReadinessTone;
}

interface ReadinessState {
  checks: ReadinessCheck[];
  counts: {
    activeDriveConnections: number;
    activeYouTubeConnections: number;
    archivedPipelines: number;
    enabledPipelines: number;
    queueItems: number;
  };
  databaseError?: string;
  databaseOk: boolean;
}

function ReadinessPanel({ readiness }: { readiness: ReadinessState }) {
  const readyCount = readiness.checks.filter((check) => check.status === "ready").length;
  const totalCount = readiness.checks.length;
  const attentionCount = readiness.checks.filter((check) => check.status === "attention").length;
  const missingCount = readiness.checks.filter((check) => check.status === "missing").length;

  return (
    <section className="panel" data-tour="readiness-panel">
      <div className="section-header">
        <div>
          <h2>Production readiness</h2>
          <p className="muted">
            Configuration and workspace checks for local testing and Vercel deploys.
          </p>
        </div>
        <span className={`badge ${missingCount ? "failed" : attentionCount ? "needs_routing" : "uploaded"}`}>
          {readyCount}/{totalCount} ready
        </span>
      </div>
      <div className="preflight-metrics" aria-label="Workspace readiness counts">
        <ReadinessMetric label="Drive grants" value={readiness.counts.activeDriveConnections} />
        <ReadinessMetric label="YouTube grants" value={readiness.counts.activeYouTubeConnections} />
        <ReadinessMetric label="Enabled pipelines" value={readiness.counts.enabledPipelines} />
        <ReadinessMetric label="Queue items" value={readiness.counts.queueItems} />
      </div>
      <div className="notice" role="status">
        <strong>Deployment runbook</strong>
        <p>
          Keep production setup consistent with the checklist in{" "}
          <a
            href="https://github.com/thedudeb/RelayRoom/blob/main/docs/DEPLOYMENT.md"
            rel="noreferrer"
            target="_blank"
          >
            docs/DEPLOYMENT.md
          </a>
          .
        </p>
      </div>
      <div className="preflight-list">
        {readiness.checks.map((check) => (
          <div className="preflight-check" key={check.label}>
            <span className={`badge ${readinessBadgeClass(check.status)}`}>
              {readinessLabel(check.status)}
            </span>
            <div>
              <strong>{check.label}</strong>
              <p className="muted">{check.detail}</p>
            </div>
          </div>
        ))}
      </div>
      {readiness.databaseError ? (
        <div className="notice danger" role="alert">
          Database check failed: {readiness.databaseError}
        </div>
      ) : null}
    </section>
  );
}

function ReadinessMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="preflight-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

async function getReadinessState(): Promise<ReadinessState> {
  const nextAuthUrl = process.env.NEXTAUTH_URL || "";
  const driveRedirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI || "";
  const youtubeRedirectUri = process.env.GOOGLE_YOUTUBE_REDIRECT_URI || "";
  const cronSecret = process.env.CRON_SECRET || process.env.DETECTION_WEBHOOK_SECRET || "";
  const checks: ReadinessCheck[] = [
    checkValue("App URL", nextAuthUrl, "NEXTAUTH_URL is set.", "Set NEXTAUTH_URL to your local or production app URL.", {
      kind: "url"
    }),
    checkValue(
      "Auth secret",
      process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
      "Auth session secret is set.",
      "Set AUTH_SECRET or NEXTAUTH_SECRET."
    ),
    checkValue("Database URL", process.env.DATABASE_URL, "DATABASE_URL is present.", "Set DATABASE_URL to your Neon Postgres connection string.", {
      kind: "postgres"
    }),
    checkValue(
      "Token encryption key",
      process.env.TOKEN_ENCRYPTION_KEY,
      "Token encryption key is present.",
      "Set TOKEN_ENCRYPTION_KEY before storing OAuth refresh tokens."
    ),
    checkPair(
      "Google sign-in OAuth",
      process.env.GOOGLE_SIGNIN_CLIENT_ID,
      process.env.GOOGLE_SIGNIN_CLIENT_SECRET,
      "Google sign-in client ID and secret are present.",
      "Add GOOGLE_SIGNIN_CLIENT_ID and GOOGLE_SIGNIN_CLIENT_SECRET."
    ),
    checkOAuthProvider({
      clientId: process.env.GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
      label: "Drive OAuth",
      redirectUri: driveRedirectUri,
      appUrl: nextAuthUrl
    }),
    checkOAuthProvider({
      clientId: process.env.GOOGLE_YOUTUBE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_YOUTUBE_CLIENT_SECRET,
      label: "YouTube OAuth",
      redirectUri: youtubeRedirectUri,
      appUrl: nextAuthUrl
    }),
    checkValue(
      "Google Picker API key",
      process.env.GOOGLE_PICKER_API_KEY,
      "Picker API key is present.",
      "Add GOOGLE_PICKER_API_KEY so operators can choose Drive folders."
    ),
    checkValue(
      "Cron secret",
      cronSecret,
      "Cron endpoint has an authorization secret.",
      "Set CRON_SECRET or DETECTION_WEBHOOK_SECRET."
    )
  ];

  const counts = {
    activeDriveConnections: 0,
    activeYouTubeConnections: 0,
    archivedPipelines: 0,
    enabledPipelines: 0,
    queueItems: 0
  };
  let databaseOk = false;
  let databaseError: string | undefined;

  try {
    const [
      activeDriveConnections,
      activeYouTubeConnections,
      enabledPipelines,
      archivedPipelines,
      queueItems
    ] = await Promise.all([
      prisma.oAuthConnection.count({
        where: { kind: ConnectionKind.DRIVE, status: ConnectionStatus.ACTIVE }
      }),
      prisma.oAuthConnection.count({
        where: { kind: ConnectionKind.YOUTUBE, status: ConnectionStatus.ACTIVE }
      }),
      prisma.pipeline.count({
        where: { archivedAt: null, status: PipelineStatus.ENABLED }
      }),
      prisma.pipeline.count({
        where: { archivedAt: { not: null } }
      }),
      prisma.queueItem.count()
    ]);

    counts.activeDriveConnections = activeDriveConnections;
    counts.activeYouTubeConnections = activeYouTubeConnections;
    counts.enabledPipelines = enabledPipelines;
    counts.archivedPipelines = archivedPipelines;
    counts.queueItems = queueItems;
    databaseOk = true;
  } catch (error) {
    databaseError = error instanceof Error ? error.message : "Unknown database error.";
  }

  checks.push({
    detail: databaseOk ? "RelayRoom can query Postgres." : "RelayRoom could not query Postgres.",
    label: "Database connection",
    status: databaseOk ? "ready" : "missing"
  });
  checks.push({
    detail:
      counts.activeDriveConnections > 0
        ? `${counts.activeDriveConnections} active Drive connection${counts.activeDriveConnections === 1 ? "" : "s"}.`
        : "Connect at least one Drive account.",
    label: "Drive account",
    status: counts.activeDriveConnections > 0 ? "ready" : "attention"
  });
  checks.push({
    detail:
      counts.activeYouTubeConnections > 0
        ? `${counts.activeYouTubeConnections} active YouTube connection${counts.activeYouTubeConnections === 1 ? "" : "s"}.`
        : "Connect at least one YouTube account.",
    label: "YouTube account",
    status: counts.activeYouTubeConnections > 0 ? "ready" : "attention"
  });
  checks.push({
    detail:
      counts.enabledPipelines > 0
        ? `${counts.enabledPipelines} enabled pipeline${counts.enabledPipelines === 1 ? "" : "s"} ready for cron.`
        : "Enable a reviewed pipeline before expecting scheduled detection.",
    label: "Enabled pipeline",
    status: counts.enabledPipelines > 0 ? "ready" : "attention"
  });
  checks.push({
    detail: "Vercel cron calls /api/cron/detect every 5 minutes.",
    label: "Cron schedule",
    status: "ready"
  });
  checks.push({
    detail: "postinstall runs prisma generate; production migrations use npm run prisma:deploy.",
    label: "Prisma build safety",
    status: "ready"
  });

  return { checks, counts, databaseError, databaseOk };
}

function checkValue(
  label: string,
  value: string | undefined,
  readyDetail: string,
  missingDetail: string,
  options: { kind?: "postgres" | "url" } = {}
): ReadinessCheck {
  if (!isConfigured(value)) {
    return { detail: missingDetail, label, status: "missing" };
  }

  if (options.kind === "url" && !isValidUrl(value || "")) {
    return { detail: `${label} is present but does not look like a URL.`, label, status: "attention" };
  }

  if (options.kind === "postgres" && !/^(postgres|postgresql):\/\//.test(value || "")) {
    return {
      detail: "DATABASE_URL is present but does not look like a Postgres connection string.",
      label,
      status: "attention"
    };
  }

  return { detail: readyDetail, label, status: "ready" };
}

function checkPair(
  label: string,
  first: string | undefined,
  second: string | undefined,
  readyDetail: string,
  missingDetail: string
): ReadinessCheck {
  return isConfigured(first) && isConfigured(second)
    ? { detail: readyDetail, label, status: "ready" }
    : { detail: missingDetail, label, status: "missing" };
}

function checkOAuthProvider({
  appUrl,
  clientId,
  clientSecret,
  label,
  redirectUri
}: {
  appUrl: string;
  clientId: string | undefined;
  clientSecret: string | undefined;
  label: string;
  redirectUri: string;
}): ReadinessCheck {
  if (!isConfigured(clientId) || !isConfigured(clientSecret) || !isConfigured(redirectUri)) {
    return {
      detail: `Add ${label} client ID, client secret, and redirect URI.`,
      label,
      status: "missing"
    };
  }

  const appOrigin = originOf(appUrl);
  const redirectOrigin = originOf(redirectUri);
  if (appOrigin && redirectOrigin && appOrigin !== redirectOrigin) {
    return {
      detail: `Redirect URI origin (${redirectOrigin}) differs from NEXTAUTH_URL (${appOrigin}).`,
      label,
      status: "attention"
    };
  }

  return { detail: `${label} client and redirect URI are present.`, label, status: "ready" };
}

function isConfigured(value?: string) {
  const normalized = String(value || "").trim().replace(/^['"]|['"]$/g, "");
  return Boolean(normalized) && !/(paste|placeholder|replace|example|xxx)/i.test(normalized);
}

function isValidUrl(value: string) {
  return Boolean(originOf(value));
}

function originOf(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function readinessBadgeClass(status: ReadinessTone) {
  if (status === "ready") return "uploaded";
  if (status === "attention") return "needs_routing";
  return "failed";
}

function readinessLabel(status: ReadinessTone) {
  if (status === "ready") return "ready";
  if (status === "attention") return "attention";
  return "missing";
}

async function getOwnerState(currentUserId: string) {
  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
    select: { role: true }
  });

  if (currentUser?.role !== Role.OWNER) {
    return { isOwner: false, users: [] };
  }

  const users = await prisma.user.findMany({
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
    select: {
      createdAt: true,
      disabledAt: true,
      email: true,
      id: true,
      name: true,
      role: true
    }
  });

  return { isOwner: true, users };
}

function UserManagementTable({
  currentUserId,
  users
}: {
  currentUserId: string | null;
  users: Awaited<ReturnType<typeof getOwnerState>>["users"];
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Created</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            const isOwner = user.role === Role.OWNER;
            const isDisabled = Boolean(user.disabledAt);

            return (
              <tr key={user.id}>
                <td>
                  <strong data-private>{user.name || user.email}</strong>
                  <div className="muted" data-private>{user.email}</div>
                </td>
                <td>{user.role.toLowerCase()}</td>
                <td>{user.createdAt.toLocaleDateString()}</td>
                <td>
                  <span className={`badge ${isDisabled ? "failed" : "uploaded"}`}>
                    {isDisabled ? "disabled" : "active"}
                  </span>
                </td>
                <td>
                  <div className="actions">
                    {isDisabled ? (
                      <form action={enableUserAction}>
                        <input name="userId" type="hidden" value={user.id} />
                        <button className="button" disabled={isSelf || isOwner} type="submit">
                          Enable
                        </button>
                      </form>
                    ) : (
                      <form action={disableUserAction}>
                        <input name="userId" type="hidden" value={user.id} />
                        <button className="button danger" disabled={isSelf || isOwner} type="submit">
                          Disable
                        </button>
                      </form>
                    )}
                    {isDisabled ? (
                      <form action={removeUserAction}>
                        <input name="userId" type="hidden" value={user.id} />
                        <button className="button danger subtle" disabled={isSelf || isOwner} type="submit">
                          Remove
                        </button>
                      </form>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

async function disableUserAction(formData: FormData) {
  "use server";

  const access = await requireOwnerAccess();
  const targetUserId = getRequiredFormValue(formData, "userId");
  await assertManageableUser(targetUserId, access.userId);

  await prisma.user.update({
    where: { id: targetUserId },
    data: { disabledAt: new Date() }
  });

  revalidatePath("/settings");
  redirect("/settings?userDisabled=true");
}

async function enableUserAction(formData: FormData) {
  "use server";

  const access = await requireOwnerAccess();
  const targetUserId = getRequiredFormValue(formData, "userId");
  await assertManageableUser(targetUserId, access.userId);

  await prisma.user.update({
    where: { id: targetUserId },
    data: { disabledAt: null }
  });

  revalidatePath("/settings");
  redirect("/settings?userEnabled=true");
}

async function removeUserAction(formData: FormData) {
  "use server";

  const access = await requireOwnerAccess();
  const targetUserId = getRequiredFormValue(formData, "userId");
  const targetUser = await assertManageableUser(targetUserId, access.userId);

  if (!targetUser.disabledAt) {
    redirect("/settings?error=DisableBeforeRemove");
  }

  await prisma.user.delete({
    where: { id: targetUserId }
  });

  revalidatePath("/settings");
  redirect("/settings?userRemoved=true");
}

async function assertManageableUser(targetUserId: string, currentUserId: string | null) {
  if (!targetUserId) {
    redirect("/settings?error=MissingUser");
  }

  if (targetUserId === currentUserId) {
    redirect("/settings?error=CannotManageSelf");
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { disabledAt: true, role: true }
  });

  if (!targetUser) {
    redirect("/settings?error=UserNotFound");
  }

  if (targetUser.role === Role.OWNER) {
    redirect("/settings?error=CannotManageOwner");
  }

  return targetUser;
}

function getRequiredFormValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function settingsErrorMessage(error: string) {
  const messages: Record<string, string> = {
    CannotManageOwner: "Owner accounts cannot be disabled or removed.",
    CannotManageSelf: "You cannot disable or remove your own account.",
    DisableBeforeRemove: "Disable a user before removing them.",
    MissingUser: "Choose a user first.",
    OwnerOnly: "Only the platform owner can manage user access.",
    UserNotFound: "User not found."
  };

  return messages[error] || `Settings action failed: ${error}`;
}
