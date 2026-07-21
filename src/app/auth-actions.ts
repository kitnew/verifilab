"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createGuestSession, createSession, destroySession, getCurrentUser, getProjectActor, switchGuestRole } from "@/lib/auth";
import { hashPassword, safeSecretEqual, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export type AuthState = { error?: string; success?: string };

const username = z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9._-]+$/, "Use lowercase letters, numbers, dots, dashes or underscores.");
const password = z.string().min(12, "Password must contain at least 12 characters.").max(128).regex(/[A-Za-z]/, "Password must contain a letter.").regex(/[0-9]/, "Password must contain a number.");
const loginSchema = z.object({ username, password: z.string().min(1).max(128) });
const accountSchema = z.object({
  name: z.string().trim().min(2).max(80),
  username,
  password,
  projectId: z.string().min(1),
  role: z.enum(["AUTHOR", "REVIEWER", "CURATOR"]),
});

export async function login(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({ username: formData.get("username"), password: formData.get("password") });
  if (!parsed.success) return { error: "Invalid username or password." };
  const user = await prisma.user.findUnique({ where: { username: parsed.data.username }, select: { id: true, isAdmin: true, isActive: true, passwordHash: true } });
  let valid = user?.passwordHash ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (user?.isAdmin && !user.passwordHash && password.safeParse(parsed.data.password).success && process.env.BOOTSTRAP_ADMIN_PASSWORD && safeSecretEqual(parsed.data.password, process.env.BOOTSTRAP_ADMIN_PASSWORD)) {
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.password) } });
    valid = true;
  } else if (!user) {
    await hashPassword(parsed.data.password);
  }
  if (!user || !user.isActive || !valid) return { error: "Invalid username or password." };
  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function guestLogin() {
  await createGuestSession();
  redirect("/dashboard");
}

export async function changeGuestRole(formData: FormData) {
  const role = z.enum(["ADMIN", "AUTHOR", "REVIEWER", "CURATOR"]).safeParse(formData.get("role"));
  if (role.success) await switchGuestRole(role.data);
  redirect("/dashboard");
}

export async function createAccount(_: AuthState, formData: FormData): Promise<AuthState> {
  const admin = await getCurrentUser();
  if (!admin || !admin.isAdmin && !admin.guestWorkspaceId) return { error: "Administrator access required." };
  const parsed = accountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const project = await prisma.project.findUnique({ where: { id: parsed.data.projectId }, select: { id: true, guestWorkspaceId: true } });
  if (!project) return { error: "Project not found." };
  const actor = admin ? await getProjectActor(project.id) : null;
  if (!admin || project.guestWorkspaceId !== admin.guestWorkspaceId || !admin.isAdmin && actor?.role !== "ADMIN") return { error: "Administrator access required." };
  try {
    const passwordHash = await hashPassword(parsed.data.password);
    await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({ data: { name: parsed.data.name, username: parsed.data.username, email: `${parsed.data.username}@accounts.verifilab.local`, passwordHash, guestWorkspaceId: admin.guestWorkspaceId } });
      await transaction.projectMembership.create({ data: { projectId: project.id, userId: user.id, role: parsed.data.role } });
      await transaction.auditEvent.create({ data: { projectId: project.id, action: "ACCOUNT_CREATED", metadata: { userId: user.id, userName: user.name, username: user.username, role: parsed.data.role, actorId: admin.id } } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: "This username already exists." };
    return { error: "Could not create the account." };
  }
  revalidatePath("/dashboard/admin/users");
  revalidatePath(`/dashboard/projects/${project.id}`);
  return { success: `Account ${parsed.data.username} created.` };
}
