import { describe, expect, it } from "vitest";
import { parseTaskSearchParams, taskSearchHref } from "@/lib/task-search";

describe("task search params", () => {
  it("parses supported filters and pagination", () => {
    expect(parseTaskSearchParams({
      q: "  fractions  ",
      project: "project-1",
      status: "APPROVED",
      difficulty: "HARD",
      verifier: "NUMERIC",
      tag: " math ",
      sort: "oldest",
      page: "3",
    })).toEqual({
      q: "fractions",
      projectId: "project-1",
      status: "APPROVED",
      difficulty: "HARD",
      verifierType: "NUMERIC",
      tag: "math",
      sort: "oldest",
      page: 3,
    });
  });

  it("falls back safely for unsupported values", () => {
    expect(parseTaskSearchParams({ status: "DELETED", sort: "random", page: "-4" })).toMatchObject({
      status: "",
      sort: "newest",
      page: 1,
    });
  });

  it("uses the first value and preserves active filters in page links", () => {
    const search = parseTaskSearchParams({ q: ["algebra", "ignored"], status: "IN_REVIEW", sort: "title" });
    expect(taskSearchHref(search, 2)).toBe("/dashboard/tasks?q=algebra&status=IN_REVIEW&sort=title&page=2");
  });
});
