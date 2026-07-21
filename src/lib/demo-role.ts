import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/review";

export const COOKIE_NAME = "verifilab-user";
const DEFAULT_USER_ID = "demo-author";

export async function getDemoUser() {
  const userId = (await cookies()).get(COOKIE_NAME)?.value || DEFAULT_USER_ID;
  return prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, isAdmin: true } });
}

export async function getProjectActor(projectId: string): Promise<{ id: string; name: string; role: Role } | null> {
  const user = await getDemoUser();
  if (!user) return null;
  if (user.isAdmin) return { id: user.id, name: user.name, role: "ADMIN" };
  const membership = await prisma.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
    select: { role: true },
  });
  return membership ? { id: user.id, name: user.name, role: membership.role } : null;
}

// Legacy callers without a project keep working in the demo; scoped mutations use getProjectActor.
export async function getDemoRole(): Promise<Role> {
  const user = await getDemoUser();
  if (user?.isAdmin) return "ADMIN";
  const membership = user && await prisma.projectMembership.findFirst({ where: { userId: user.id }, select: { role: true } });
  return membership?.role ?? "AUTHOR";
}
