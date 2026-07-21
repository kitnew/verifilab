import { describe, expect, it } from "vitest";
import { myWorkSections, type WorkTask } from "./my-work";

describe("My Work queries", () => {
  it("places assignments in role-aware sections", () => {
    const date = (value: string) => new Date(value);
    const tasks: WorkTask[] = [
      { id: "authoring", status: "IN_PROGRESS", assignedAuthorId: "me", assignedReviewerId: null, dueDate: null, completedAt: null },
      { id: "review", status: "IN_REVIEW", assignedAuthorId: "other", assignedReviewerId: "me", dueDate: null, completedAt: null },
      { id: "changes", status: "CHANGES_REQUESTED", assignedAuthorId: "me", assignedReviewerId: "other", dueDate: null, completedAt: null },
      { id: "overdue", status: "DRAFT", assignedAuthorId: "me", assignedReviewerId: null, dueDate: date("2026-07-01"), completedAt: null },
      { id: "completed", status: "APPROVED", assignedAuthorId: "me", assignedReviewerId: "other", dueDate: date("2026-07-01"), completedAt: date("2026-07-10") },
    ];
    const sections = myWorkSections(tasks, "me", date("2026-07-21"));
    expect(sections.authoring.map(({ id }) => id)).toEqual(["authoring", "overdue"]);
    expect(sections.review.map(({ id }) => id)).toEqual(["review"]);
    expect(sections.changes.map(({ id }) => id)).toEqual(["changes"]);
    expect(sections.overdue.map(({ id }) => id)).toEqual(["overdue"]);
    expect(sections.completed.map(({ id }) => id)).toEqual(["completed"]);
  });
});
