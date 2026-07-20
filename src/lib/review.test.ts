import { describe, expect, it } from "vitest";
import { can, reviewTransition, type ReviewAction, type Role, type TaskStatus } from "./review";

describe("reviewTransition", () => {
  it.each([
    ["DRAFT", "SUBMIT", "AUTHOR", "IN_REVIEW"],
    ["DRAFT", "SUBMIT", "ADMIN", "IN_REVIEW"],
    ["IN_REVIEW", "APPROVE", "REVIEWER", "APPROVED"],
    ["IN_REVIEW", "REJECT", "REVIEWER", "REJECTED"],
    ["REJECTED", "REOPEN", "AUTHOR", "DRAFT"],
    ["APPROVED", "REOPEN", "ADMIN", "DRAFT"],
  ] as const)("allows %s -> %s for %s", (status, action, role, nextStatus) => {
    expect(reviewTransition(status, action, role, action === "REJECT" ? "Needs evidence" : "")).toMatchObject({
      ok: true,
      nextStatus,
    });
  });

  it.each([
    ["DRAFT", "APPROVE"],
    ["DRAFT", "REJECT"],
    ["IN_REVIEW", "SUBMIT"],
    ["REJECTED", "APPROVE"],
    ["APPROVED", "SUBMIT"],
  ] as [TaskStatus, ReviewAction][])("rejects invalid transition %s -> %s", (status, action) => {
    expect(reviewTransition(status, action, "ADMIN", "comment")).toMatchObject({ ok: false });
  });

  it.each([
    ["REVIEWER", "DRAFT", "SUBMIT"],
    ["AUTHOR", "IN_REVIEW", "APPROVE"],
    ["AUTHOR", "IN_REVIEW", "REJECT"],
    ["REVIEWER", "REJECTED", "REOPEN"],
    ["AUTHOR", "APPROVED", "REOPEN"],
  ] as [Role, TaskStatus, ReviewAction][])("rejects %s permission for %s/%s", (role, status, action) => {
    expect(reviewTransition(status, action, role, "comment")).toMatchObject({ ok: false });
  });

  it.each(["", "  ", "\n\t"])("requires a rejection comment for %j", (comment) => {
    expect(reviewTransition("IN_REVIEW", "REJECT", "REVIEWER", comment)).toEqual({
      ok: false,
      error: "A rejection comment is required.",
    });
  });

  it("trims a valid rejection comment", () => {
    expect(reviewTransition("IN_REVIEW", "REJECT", "REVIEWER", "  Add a citation.  ")).toMatchObject({
      ok: true,
      comment: "Add a citation.",
    });
  });
});

describe("permissions", () => {
  it("matches the prototype role capabilities", () => {
    expect(can("AUTHOR", "EDIT_TASK")).toBe(true);
    expect(can("AUTHOR", "APPROVE_TASK")).toBe(false);
    expect(can("REVIEWER", "COMMENT")).toBe(true);
    expect(can("REVIEWER", "CREATE_TASK")).toBe(false);
    expect(can("REVIEWER", "DELETE_TASK")).toBe(false);
    expect(can("ADMIN", "REOPEN_APPROVED")).toBe(true);
  });
});
