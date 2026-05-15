import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { requireAppAccess, requireOwnerAccess } from "@/lib/auth/account";
import { prisma } from "@/lib/db/prisma";

export default async function SettingsPage({
  searchParams
}: {
  searchParams?: Promise<{ demo?: string; error?: string; userEnabled?: string; userDisabled?: string; userRemoved?: string }>;
}) {
  const params = await searchParams;
  const access = await requireAppAccess(params);
  const ownerState = access.isDemo ? null : await getOwnerState(access.userId);

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
        <section className="panel">
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
            <label className="stack">
              <span>Read-only API key</span>
              <input
                className="input"
                readOnly
                value="rpp_live_demo_redacted_9b6c"
                aria-label="Read-only API key"
              />
            </label>
            <button className="button" type="button">Rotate API key</button>
          </div>
        </section>
        <section className="panel">
          <h2>Owner Controls</h2>
          <p className="muted">
            The first matching INITIAL_ADMIN_EMAIL account can disable or remove users, but
            cannot view their private connections, pipelines, or queue items.
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
      </div>
    </AppShell>
  );
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
