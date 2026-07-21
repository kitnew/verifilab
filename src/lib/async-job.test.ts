import { describe, expect, it } from "vitest";
import { canCancelJob, canManageJob, canRetryJob, transitionJob } from "./async-job";

describe("async job lifecycle", () => {
  it.each([
    ["QUEUED", "START", "RUNNING"], ["QUEUED", "CANCEL", "CANCELLED"], ["RUNNING", "COMPLETE", "COMPLETED"], ["RUNNING", "FAIL", "FAILED"], ["RUNNING", "CANCEL", "CANCELLED"],
  ] as const)("allows %s -> %s", (status, action, expected) => expect(transitionJob(status, action)).toBe(expected));

  it("rejects terminal and out-of-order transitions", () => {
    expect(transitionJob("QUEUED", "COMPLETE")).toBeNull();
    expect(transitionJob("COMPLETED", "CANCEL")).toBeNull();
    expect(transitionJob("FAILED", "START")).toBeNull();
  });

  it("enforces retry and cancellation rules", () => {
    expect(canRetryJob("FAILED")).toBe(true); expect(canRetryJob("CANCELLED")).toBe(true); expect(canRetryJob("COMPLETED")).toBe(false); expect(canRetryJob("RUNNING")).toBe(false);
    expect(canCancelJob("QUEUED")).toBe(true); expect(canCancelJob("RUNNING")).toBe(true); expect(canCancelJob("FAILED")).toBe(false); expect(canCancelJob("CANCELLED")).toBe(false);
  });
});

describe("async job permissions", () => {
  const authoring = { type: "BULK_IMPORT" as const, initiatorId: "author" };
  const release = { type: "DATASET_RELEASE" as const, initiatorId: "curator" };
  it("limits authors to their own authoring jobs", () => {
    expect(canManageJob("AUTHOR", "author", authoring)).toBe(true);
    expect(canManageJob("AUTHOR", "other", authoring)).toBe(false);
    expect(canManageJob("AUTHOR", "author", release)).toBe(false);
  });
  it("allows reviewers operational release jobs without content authority", () => expect(canManageJob("REVIEWER", "reviewer", release)).toBe(true));
  it.each(["OPERATOR", "CURATOR", "ADMIN"] as const)("lets %s manage all project jobs", (role) => expect(canManageJob(role, "user", authoring)).toBe(true));
});
