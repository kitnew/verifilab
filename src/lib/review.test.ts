import { describe, expect, it } from "vitest";
import { can, canEditAssignedTask, canReviewAssignedTask, reviewTransition, type ReviewAction, type TaskStatus } from "./review";

describe("contributor workflow transitions", () => {
  it.each([
    ["DRAFT", "START", "AUTHOR", "IN_PROGRESS"],
    ["IN_PROGRESS", "SUBMIT", "AUTHOR", "IN_REVIEW"],
    ["IN_REVIEW", "REQUEST_CHANGES", "REVIEWER", "CHANGES_REQUESTED"],
    ["CHANGES_REQUESTED", "START", "AUTHOR", "IN_PROGRESS"],
    ["IN_REVIEW", "APPROVE", "REVIEWER", "APPROVED"],
    ["IN_REVIEW", "REJECT", "CURATOR", "REJECTED"],
  ] as const)("allows %s via %s for %s", (status, action, role, nextStatus) => {
    expect(reviewTransition(status, action, role, ["REJECT", "REQUEST_CHANGES"].includes(action) ? "Feedback" : "")).toMatchObject({ ok: true, nextStatus });
  });

  it.each([
    ["DRAFT", "APPROVE"],
    ["IN_PROGRESS", "REJECT"],
    ["IN_REVIEW", "START"],
    ["CHANGES_REQUESTED", "SUBMIT"],
    ["APPROVED", "SUBMIT"],
    ["REJECTED", "START"],
  ] as [TaskStatus, ReviewAction][]) ("rejects invalid transition %s/%s", (status, action) => {
    expect(reviewTransition(status, action, "ADMIN", "comment")).toMatchObject({ ok: false });
  });

  it.each(["", "  ", "\n\t"])("requires feedback for changes and rejection: %j", (comment) => {
    expect(reviewTransition("IN_REVIEW", "REQUEST_CHANGES", "REVIEWER", comment)).toEqual({ ok: false, error: "A review comment is required." });
    expect(reviewTransition("IN_REVIEW", "REJECT", "REVIEWER", comment)).toEqual({ ok: false, error: "A review comment is required." });
  });
});

describe("project-scoped permissions", () => {
  it("matches contributor capabilities", () => {
    expect(can("AUTHOR", "EDIT_TASK")).toBe(true);
    expect(can("AUTHOR", "REVIEW_TASK")).toBe(false);
    expect(can("REVIEWER", "COMMENT")).toBe(true);
    expect(can("REVIEWER", "EDIT_TASK")).toBe(false);
    expect(can("CURATOR", "ASSIGN_TASK")).toBe(true);
    expect(can("CURATOR", "CREATE_RELEASE")).toBe(true);
    expect(can("ADMIN", "MANAGE_MEMBERS")).toBe(true);
  });

  it("limits authors and reviewers to their assignment and prevents self-review", () => {
    expect(canEditAssignedTask("AUTHOR", "author", "author")).toBe(true);
    expect(canEditAssignedTask("AUTHOR", "other", "author")).toBe(false);
    expect(canReviewAssignedTask("REVIEWER", "reviewer", "author", "reviewer")).toBe(true);
    expect(canReviewAssignedTask("REVIEWER", "other", "author", "reviewer")).toBe(false);
    expect(canReviewAssignedTask("ADMIN", "author", "author", "reviewer")).toBe(false);
  });
});
