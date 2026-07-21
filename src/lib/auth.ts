import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/review";

export const SESSION_COOKIE = "verifilab-session";
const SESSION_AGE_SECONDS = 60 * 60 * 24 * 7;

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_AGE_SECONDS * 1_000);
  await prisma.session.create({ data: { userId, tokenHash: tokenHash(token), expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    select: { expiresAt: true, user: { select: { id: true, name: true, username: true, isAdmin: true, isActive: true } } },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.isActive) return null;
  return session.user;
}

export async function getProjectActor(projectId: string): Promise<{ id: string; name: string; role: Role } | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.isAdmin) return { id: user.id, name: user.name, role: "ADMIN" };
  const membership = await prisma.projectMembership.findUnique({ where: { projectId_userId: { projectId, userId: user.id } }, select: { role: true } });
  return membership ? { id: user.id, name: user.name, role: membership.role } : null;
}
