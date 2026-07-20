import { z } from "zod";

export const projectSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  description: z.string().trim().max(400).default(""),
});

export const taskSchema = z
  .object({
    title: z.string().trim().min(3, "Title must be at least 3 characters").max(120),
    prompt: z.string().trim().min(10, "Prompt must be at least 10 characters").max(10_000),
    verifierType: z.enum(["EXACT_MATCH", "NUMERIC", "REGEX"]),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
    status: z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED"]),
    tags: z.string().max(300).default(""),
    expectedText: z.string().max(2_000).default(""),
    expectedNumber: z.string().default(""),
    tolerance: z.string().default("0"),
    pattern: z.string().max(2_000).default(""),
    flags: z.string().regex(/^[dgimsuvy]*$/, "Use valid JavaScript regex flags only").default(""),
  })
  .superRefine((value, ctx) => {
    if (value.verifierType === "EXACT_MATCH" && !value.expectedText.trim()) {
      ctx.addIssue({ code: "custom", path: ["expectedText"], message: "Expected answer is required" });
    }
    if (value.verifierType === "NUMERIC") {
      const expected = Number(value.expectedNumber);
      const tolerance = Number(value.tolerance);
      if (!value.expectedNumber.trim() || !Number.isFinite(expected)) {
        ctx.addIssue({ code: "custom", path: ["expectedNumber"], message: "Enter a valid number" });
      }
      if (!value.tolerance.trim() || !Number.isFinite(tolerance) || tolerance < 0) {
        ctx.addIssue({ code: "custom", path: ["tolerance"], message: "Tolerance must be zero or greater" });
      }
    }
    if (value.verifierType === "REGEX") {
      if (!value.pattern) {
        ctx.addIssue({ code: "custom", path: ["pattern"], message: "Pattern is required" });
      } else {
        try {
          new RegExp(value.pattern, value.flags);
        } catch {
          ctx.addIssue({ code: "custom", path: ["pattern"], message: "Enter a valid regular expression" });
        }
      }
    }
  });

export type ProjectInput = z.input<typeof projectSchema>;
export type TaskInput = z.input<typeof taskSchema>;

export function toTaskData(input: TaskInput) {
  const value = taskSchema.parse(input);
  const verifierConfig =
    value.verifierType === "EXACT_MATCH"
      ? { expected: value.expectedText.trim(), caseSensitive: false }
      : value.verifierType === "NUMERIC"
        ? { expected: Number(value.expectedNumber), tolerance: Number(value.tolerance) }
        : { pattern: value.pattern, flags: value.flags };

  return {
    title: value.title,
    prompt: value.prompt,
    verifierType: value.verifierType,
    difficulty: value.difficulty,
    status: value.status,
    tags: [...new Set(value.tags.split(",").map((tag) => tag.trim()).filter(Boolean))],
    verifierConfig,
  };
}
