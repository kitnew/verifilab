import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  createRun: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findUnique: mocks.findUnique },
    verificationRun: { create: mocks.createRun },
  },
}));

import { runVerification } from "./actions";

describe("runVerification", () => {
  beforeEach(() => vi.clearAllMocks());

  it("validates, verifies, persists, and revalidates a passing run", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "task-1",
      projectId: "project-1",
      verifierType: "EXACT_MATCH",
      verifierConfig: { expected: "Bucharest", caseSensitive: false, trimWhitespace: true },
    });
    mocks.createRun.mockResolvedValue({ id: "run-1" });

    const response = await runVerification("task-1", " bucharest ");

    expect(response.result).toMatchObject({ passed: true, reward: 1, normalizedCandidate: "bucharest" });
    expect(mocks.createRun).toHaveBeenCalledWith({
      data: expect.objectContaining({ taskId: "task-1", candidate: " bucharest ", passed: true }),
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/projects/project-1/tasks/task-1");
  });

  it("rejects oversized candidates before querying the database", async () => {
    const response = await runVerification("task-1", "x".repeat(10_001));
    expect(response).toEqual({ error: "Candidate response is too long" });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("rejects invalid stored verifier configuration without persisting", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "task-1",
      projectId: "project-1",
      verifierType: "REGEX",
      verifierConfig: { pattern: "[", flags: "" },
    });

    expect(await runVerification("task-1", "candidate")).toEqual({
      error: "This task has an invalid verifier configuration.",
    });
    expect(mocks.createRun).not.toHaveBeenCalled();
  });

  it("returns a clear persistence error", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "task-1",
      projectId: "project-1",
      verifierType: "NUMERIC",
      verifierConfig: { expected: 42, tolerance: 0 },
    });
    mocks.createRun.mockRejectedValue(new Error("database unavailable"));

    expect(await runVerification("task-1", "42")).toEqual({
      error: "Verification ran, but the result could not be saved.",
    });
  });
});
