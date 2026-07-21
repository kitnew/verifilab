import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { candidateSchema, storedVerifierSchema } from "@/lib/validation";
import { verify, type VerificationResult } from "@/lib/verifier";

type VerificationTask = { id: string; projectId: string; verifierVersions: { id: string; version: number; verifierType: "EXACT_MATCH" | "NUMERIC" | "REGEX" | "JSON_SCHEMA"; verifierConfig: unknown }[] };

export async function runVerificationRecord(projectId: string, taskId: string, candidate: string, loadedTask?: VerificationTask): Promise<{ error?: string; kind?: "validation" | "not_found" | "internal"; result?: VerificationResult }> {
  const parsedCandidate = candidateSchema.safeParse(candidate);
  if (!parsedCandidate.success) return { error: parsedCandidate.error.issues[0].message, kind: "validation" };
  const task = loadedTask ?? await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, projectId: true, verifierVersions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!task || task.projectId !== projectId) return { error: "Task not found.", kind: "not_found" };
  const active = task.verifierVersions[0];
  if (!active) return { error: "Task has no verifier version.", kind: "validation" };
  const parsedVerifier = storedVerifierSchema.safeParse({ type: active.verifierType, config: active.verifierConfig });
  if (!parsedVerifier.success) return { error: "This task has an invalid verifier configuration.", kind: "validation" };
  const result = verify(parsedCandidate.data, parsedVerifier.data);
  const details: Prisma.InputJsonObject = {
    reward: result.reward, details: result.details, executionTimeMs: result.executionTimeMs,
    ...(result.normalizedCandidate === undefined ? {} : { normalizedCandidate: result.normalizedCandidate }),
    ...(result.validationErrors === undefined ? {} : { validationErrors: result.validationErrors as Prisma.InputJsonValue }),
  };
  try {
    await prisma.$transaction([
      prisma.verificationRun.create({ data: { taskId, verifierVersionId: active.id, candidate: parsedCandidate.data, passed: result.passed, details } }),
      prisma.auditEvent.create({ data: { projectId, taskId, action: "VERIFICATION_EXECUTED", metadata: { passed: result.passed, reward: result.reward, executionTimeMs: result.executionTimeMs, verifierVersion: active.version } } }),
    ]);
    return { result };
  } catch {
    return { error: "Verification ran, but the result could not be saved.", kind: "internal" };
  }
}
