import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { roles, type Role } from "@/lib/review";

export const SESSION_COOKIE = "verifilab-session";
const SESSION_AGE_SECONDS = 60 * 60 * 24 * 7;

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_AGE_SECONDS * 1_000);
  await prisma.session.create({ data: { userId, tokenHash: tokenHash(token), expiresAt } });
  await setSessionCookie(token, expiresAt);
}

export async function createGuestSession() {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_AGE_SECONDS * 1_000);
  await prisma.$transaction(async (transaction) => {
    const workspace = await transaction.guestWorkspace.create({ data: {} });
    const users = await Promise.all(roles.map((role) => transaction.user.create({ data: {
      name: `Guest ${role[0]}${role.slice(1).toLowerCase()}`,
      email: `${workspace.id}-${role.toLowerCase()}@guest.verifilab.local`,
      guestWorkspaceId: workspace.id,
    } })));
    await transaction.project.create({ data: {
      name: "Guest Workspace",
      description: "Temporary workspace deleted when the guest signs out or the server restarts.",
      guestWorkspaceId: workspace.id,
      memberships: { create: roles.map((role, index) => ({ role, userId: users[index].id })) },
      auditEvents: { create: { action: "PROJECT_CREATED", metadata: { source: "guest" } } },
    } });
    await transaction.session.create({ data: { userId: users[3].id, tokenHash: tokenHash(token), expiresAt } });
  });
  await setSessionCookie(token, expiresAt);
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const session = await prisma.session.findUnique({ where: { tokenHash: tokenHash(token) }, select: { user: { select: { guestWorkspaceId: true } } } });
    if (session?.user.guestWorkspaceId) await prisma.guestWorkspace.delete({ where: { id: session.user.guestWorkspaceId } });
    else await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  }
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    select: { expiresAt: true, user: { select: { id: true, name: true, username: true, isAdmin: true, isActive: true, guestWorkspaceId: true, memberships: { select: { role: true }, take: 1 } } } },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.isActive) return null;
  return { ...session.user, role: session.user.memberships[0]?.role ?? null };
}

export async function getProjectActor(projectId: string): Promise<{ id: string; name: string; role: Role } | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { guestWorkspaceId: true } });
  if (!project || project.guestWorkspaceId !== user.guestWorkspaceId) return null;
  if (user.isAdmin) return { id: user.id, name: user.name, role: "ADMIN" };
  const membership = await prisma.projectMembership.findUnique({ where: { projectId_userId: { projectId, userId: user.id } }, select: { role: true } });
  return membership ? { id: user.id, name: user.name, role: membership.role } : null;
}

export async function switchGuestRole(role: Role) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const session = await prisma.session.findUnique({ where: { tokenHash: tokenHash(token) }, select: { user: { select: { guestWorkspaceId: true } } } });
  const workspaceId = session?.user.guestWorkspaceId;
  if (!workspaceId) return false;
  const user = await prisma.user.findFirst({ where: { guestWorkspaceId: workspaceId, memberships: { some: { role, project: { guestWorkspaceId: workspaceId } } } }, select: { id: true } });
  if (!user) return false;
  await prisma.session.update({ where: { tokenHash: tokenHash(token) }, data: { userId: user.id } });
  return true;
}

export async function deleteGuestWorkspaces() {
  await prisma.guestWorkspace.deleteMany();
}

async function setSessionCookie(token: string, expires: Date) {
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires });
}
