import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), auditCreate: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn().mockResolvedValue({ id: "user" }), getProjectActor: vi.fn().mockResolvedValue({ id: "user", role: "AUTHOR" }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { evaluationBatch: { findUnique: mocks.findUnique }, auditEvent: { create: mocks.auditCreate } } }));

import { GET } from "./route";

it("streams a filtered JSONL export with deterministic headers and filename", async () => {
  mocks.findUnique.mockResolvedValue({ id: "batch-1", name: "Quoted run", taskId: "task-1", taskPromptSnapshot: "Return yes", verifierTypeSnapshot: "EXACT_MATCH", verifierConfigSnapshot: { expected: "yes" }, createdAt: new Date("2026-07-20"), task: { projectId: "project-1" }, results: [{ sequenceNumber: 2, candidateResponse: "no\nthanks", passed: false, reward: 0, status: "FAILED", modelName: null, modelVersion: null, temperature: null, seed: null, externalId: null, details: "No", normalizedCandidate: "no\nthanks", executionTimeMs: 1, metadata: null }] });
  const response = await GET(new Request("http://localhost/api/evaluations/batch-1/export?format=jsonl&status=FAILED"), { params: Promise.resolve({ batchId: "batch-1" }) });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
  expect(response.headers.get("content-disposition")).toBe('attachment; filename="verifilab-evaluation-quoted-run-2026-07-20.jsonl"');
  expect(await response.text()).toContain('"candidateResponse":"no\\nthanks"');
  expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ results: expect.objectContaining({ where: { status: "FAILED" }, orderBy: { sequenceNumber: "asc" } }) }) }));
});
