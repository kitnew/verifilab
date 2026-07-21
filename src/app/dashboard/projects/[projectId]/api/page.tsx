import { notFound } from "next/navigation";
import { ApiSettings } from "@/components/api-settings";
import { getProjectActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ProjectApiPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, actor] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, apiTokens: { select: { id: true, name: true, prefix: true, scopes: true, createdAt: true, lastUsedAt: true, expiresAt: true, revokedAt: true, createdBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } } } }),
    getProjectActor(projectId),
  ]);
  if (!project || actor?.role !== "ADMIN") notFound();
  return <div className="space-y-7"><div><p className="mb-1 text-sm font-semibold text-indigo-600">{project.name}</p><h1 className="text-3xl font-bold tracking-tight">API settings</h1><p className="mt-2 text-slate-500">Create scoped project tokens and exercise the supported API through real HTTP routes.</p></div><ApiSettings projectId={project.id} tokens={project.apiTokens.map((token) => ({ ...token, scopes: Array.isArray(token.scopes) ? token.scopes.filter((scope): scope is string => typeof scope === "string") : [] }))} /></div>;
}
