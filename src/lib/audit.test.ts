import { describe, expect, it } from "vitest";
import { auditDetail, auditLabel } from "@/lib/audit";

describe("audit display", () => {
  it("labels tracked activity and formats verification metadata", () => {
    expect(auditLabel("TASK_APPROVE")).toBe("Task approved");
    expect(auditDetail("VERIFICATION_EXECUTED", { passed: true, reward: 1, executionTimeMs: 0.125 })).toBe("PASS · reward 1 · 0.125 ms");
  });

  it("falls back safely for unknown actions and metadata", () => {
    expect(auditLabel("TASK_TAGS_ADDED")).toBe("Task tags added");
    expect(auditDetail("DATASET_EXPORTED", null)).toBe("Unknown · UNKNOWN");
  });

  it("formats verifier version audit events", () => {
    expect(auditLabel("VERIFIER_VERSION_CREATED")).toBe("Verifier version created");
    expect(auditDetail("VERIFIER_VERSION_RESTORED", { version: 4, sourceVersion: 1 })).toBe("Version 4 from version 1");
  });
});
