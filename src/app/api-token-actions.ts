"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiTokenInputSchema, generateApiToken } from "@/lib/api-token";
import { getProjectActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Result = { error?: string; rawToken?: string; tokenId?: string };

export async function createProjectApiToken(projectId: string, input: unknown): Promise<Result> {
  const actor = await getProjectActor(projectId);
  if (!actor || actor.role !== "ADMIN") return { error: "Only a project administrator can manage API tokens." };
  const parsed = apiTokenInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const generated = generateApiToken();
  try {
    const token = await prisma.$transaction(async (tx) => {
      const created = await tx.apiToken.create({ data: { projectId, name: parsed.data.name, prefix: generated.prefix, tokenHash: generated.tokenHash, scopes: parsed.data.scopes, createdById: actor.id, expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null } });
      await tx.auditEvent.create({ data: { projectId, action: "API_TOKEN_CREATED", metadata: { tokenId: created.id, name: created.name, prefix: created.prefix, scopes: parsed.data.scopes, actorId: actor.id } } });
      return created;
    });
    revalidatePath(`/dashboard/projects/${projectId}/api`); revalidatePath("/dashboard/activity");
    return { rawToken: generated.raw, tokenId: token.id };
  } catch {
    return { error: "Could not create the API token." };
  }
}

export async function renameProjectApiToken(projectId: string, tokenId: string, name: string): Promise<Result> {
  const actor = await getProjectActor(projectId);
  if (!actor || actor.role !== "ADMIN") return { error: "Only a project administrator can manage API tokens." };
  const parsed = z.string().trim().min(2).max(80).safeParse(name);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const token = await prisma.apiToken.findFirst({ where: { id: tokenId, projectId }, select: { id: true, name: true, prefix: true } });
  if (!token) return { error: "API token not found." };
  await prisma.$transaction([
    prisma.apiToken.update({ where: { id: token.id }, data: { name: parsed.data } }),
    prisma.auditEvent.create({ data: { projectId, action: "API_TOKEN_RENAMED", metadata: { tokenId, prefix: token.prefix, from: token.name, to: parsed.data, actorId: actor.id } } }),
  ]);
  revalidatePath(`/dashboard/projects/${projectId}/api`); revalidatePath("/dashboard/activity");
  return {};
}

export async function revokeProjectApiToken(projectId: string, tokenId: string): Promise<Result> {
  const actor = await getProjectActor(projectId);
  if (!actor || actor.role !== "ADMIN") return { error: "Only a project administrator can manage API tokens." };
  const token = await prisma.apiToken.findFirst({ where: { id: tokenId, projectId }, select: { id: true, prefix: true, revokedAt: true } });
  if (!token) return { error: "API token not found." };
  if (token.revokedAt) return { error: "API token is already revoked." };
  await prisma.$transaction([
    prisma.apiToken.update({ where: { id: token.id }, data: { revokedAt: new Date() } }),
    prisma.auditEvent.create({ data: { projectId, action: "API_TOKEN_REVOKED", metadata: { tokenId, prefix: token.prefix, actorId: actor.id } } }),
  ]);
  revalidatePath(`/dashboard/projects/${projectId}/api`); revalidatePath("/dashboard/activity");
  return {};
}
