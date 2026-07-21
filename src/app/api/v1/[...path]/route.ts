import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiError, authenticateApiToken } from "@/lib/api-token";
import type { ApiTokenScope } from "@/lib/api-token-scopes";
import { prisma } from "@/lib/prisma";
import { createTaskRecord } from "@/lib/task-service";
import { runVerificationRecord } from "@/lib/verification-service";

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context) { return handle(request, context, "GET"); }
export async function POST(request: Request, context: Context) { return handle(request, context, "POST"); }

async function handle(request: Request, { params }: Context, method: "GET" | "POST") {
  const path = (await params).path;
  const scope = endpointScope(method, path);
  if (!scope) return apiError(404, "not_found", "API endpoint not found.");
  const auth = await authenticateApiToken(request, scope);
  if (!auth.ok) return auth.response;
  try {
    if (method === "GET" && path.length === 1 && path[0] === "tasks") {
      // ponytail: representative API returns the newest 100 tasks; add cursor pagination when clients need more.
      const tasks = await prisma.task.findMany({ where: { projectId: auth.token.projectId }, select: { id: true, title: true, prompt: true, verifierType: true, verifierConfig: true, difficulty: true, status: true, tags: true, createdAt: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 100 });
      return Response.json({ data: tasks });
    }
    if (method === "POST" && path.length === 1 && path[0] === "tasks") {
      const body = await jsonBody(request);
      if (!body.ok) return body.response;
      const created = await createTaskRecord(auth.token.projectId, body.value);
      if (!created.task) return apiError(created.kind === "validation" ? 422 : created.kind === "not_found" ? 404 : 500, created.kind === "validation" ? "validation_error" : created.kind === "not_found" ? "not_found" : "internal_error", created.error ?? "Task creation failed.", created.fieldErrors);
      revalidatePath(`/dashboard/projects/${auth.token.projectId}`); revalidatePath("/dashboard/activity");
      return Response.json({ data: created.task }, { status: 201 });
    }
    if (method === "POST" && path.length === 1 && path[0] === "verifications") {
      const body = await jsonBody(request);
      if (!body.ok) return body.response;
      const parsed = z.object({ taskId: z.string().min(1), candidate: z.string().max(100_000) }).safeParse(body.value);
      if (!parsed.success) return apiError(422, "validation_error", "Verification input is invalid.", parsed.error.flatten().fieldErrors);
      const outcome = await runVerificationRecord(auth.token.projectId, parsed.data.taskId, parsed.data.candidate);
      if (!outcome.result) return apiError(outcome.kind === "not_found" ? 404 : outcome.kind === "internal" ? 500 : 422, outcome.kind === "not_found" ? "not_found" : outcome.kind === "internal" ? "internal_error" : "validation_error", outcome.error ?? "Verification failed.");
      revalidatePath(`/dashboard/projects/${auth.token.projectId}/tasks/${parsed.data.taskId}`); revalidatePath("/dashboard/activity");
      return Response.json({ data: outcome.result });
    }
    if (method === "GET" && path.length === 2 && path[0] === "datasets") {
      const dataset = await prisma.dataset.findFirst({ where: { id: path[1], projectId: auth.token.projectId }, select: { id: true, name: true, description: true, createdAt: true, updatedAt: true, items: { orderBy: { position: "asc" }, select: { position: true, task: { select: { id: true, title: true, prompt: true, verifierType: true, verifierConfig: true, difficulty: true, status: true, tags: true } } } } } });
      return dataset ? Response.json({ data: dataset }) : apiError(404, "not_found", "Dataset not found.");
    }
    if (method === "GET" && path.length === 2 && path[0] === "jobs") {
      const job = await prisma.asyncJob.findFirst({ where: { id: path[1], projectId: auth.token.projectId }, select: { id: true, type: true, status: true, progress: true, inputSummary: true, resultReference: true, safeErrorMessage: true, startedAt: true, completedAt: true, createdAt: true, updatedAt: true } });
      return job ? Response.json({ data: job }) : apiError(404, "not_found", "Job not found.");
    }
    return apiError(404, "not_found", "API endpoint not found.");
  } catch {
    return apiError(500, "internal_error", "The request could not be completed.");
  }
}

function endpointScope(method: string, path: string[]): ApiTokenScope | null {
  if (path.length === 1 && path[0] === "tasks") return method === "GET" ? "tasks:read" : method === "POST" ? "tasks:write" : null;
  if (method === "POST" && path.length === 1 && path[0] === "verifications") return "verifications:run";
  if (method === "GET" && path.length === 2 && path[0] === "datasets") return "datasets:read";
  if (method === "GET" && path.length === 2 && path[0] === "jobs") return "jobs:read";
  return null;
}

async function jsonBody(request: Request) {
  try { return { ok: true as const, value: await request.json() }; }
  catch { return { ok: false as const, response: apiError(400, "invalid_json", "Request body must be valid JSON.") }; }
}
