import { describe, expect, it } from "vitest";
import { MAX_TASK_IMPORT_BYTES, parseTaskImport, planTaskImport, validateTaskImportRow } from "./task-import";

const exact = {
  title: "Capital of France",
  prompt: "What is the capital city of France?",
  verifierType: "EXACT_MATCH",
  verifierConfig: { expected: "Paris", caseSensitive: false, trimWhitespace: true },
  difficulty: "EASY",
  tags: ["geography", "capital"],
};

describe("task import parsing", () => {
  it("parses JSON arrays and JSONL with row numbers", () => {
    const json = parseTaskImport(JSON.stringify([exact]), "JSON");
    expect(json).toMatchObject({ totalRows: 1, validRows: 1, invalidRows: 0 });
    expect(json.rows[0].task?.verifierConfig).toEqual(exact.verifierConfig);

    const jsonl = parseTaskImport(JSON.stringify(exact) + "\nnot-json\n", "JSONL");
    expect(jsonl).toMatchObject({ totalRows: 2, validRows: 1, invalidRows: 1 });
    expect(jsonl.rows[1]).toMatchObject({ rowNumber: 2, errors: ["Malformed JSON."] });
  });

  it("parses CSV verifier configuration and comma-separated tags", () => {
    const csv = 'title,prompt,verifierType,verifierConfig,difficulty,tags\n"Add two numbers","Calculate two plus two exactly.",NUMERIC,"{""expected"":4,""tolerance"":0}",EASY,"math,arithmetic"\n';
    const preview = parseTaskImport(csv, "CSV");
    expect(preview).toMatchObject({ totalRows: 1, validRows: 1, invalidRows: 0 });
    expect(preview.rows[0].task).toMatchObject({ verifierType: "NUMERIC", verifierConfig: { expected: 4, tolerance: 0 }, tags: ["math", "arithmetic"] });
  });

  it("reports canonical field and invalid verifier errors", () => {
    const missing = validateTaskImportRow({ ...exact, title: "" });
    expect(missing).toMatchObject({ success: false });
    if (!missing.success) expect(missing.errors.join(" ")).toContain("Title must be at least 3 characters");

    const regex = validateTaskImportRow({ ...exact, verifierType: "REGEX", verifierConfig: { pattern: "[", flags: "" } });
    expect(regex).toMatchObject({ success: false });
    if (!regex.success) expect(regex.errors.join(" ")).toContain("Invalid regular expression");

    const schema = validateTaskImportRow({ ...exact, verifierType: "JSON_SCHEMA", verifierConfig: { schema: { type: "not-a-real-type" } } });
    expect(schema).toMatchObject({ success: false });
  });

  it("detects project and in-file duplicates and applies both strategies", () => {
    const preview = parseTaskImport(JSON.stringify([exact, exact]), "JSON", [validate(exact)]);
    expect(preview.duplicateRows).toBe(2);
    expect(planTaskImport(preview, "SKIP").counts).toEqual({ total: 2, imported: 0, skipped: 2, duplicate: 2, failed: 0 });
    expect(planTaskImport(preview, "IMPORT").counts).toEqual({ total: 2, imported: 2, skipped: 0, duplicate: 2, failed: 0 });
  });

  it("enforces file and row limits", () => {
    expect(parseTaskImport("x".repeat(MAX_TASK_IMPORT_BYTES + 1), "JSONL").error).toContain("File exceeds");
    expect(parseTaskImport(JSON.stringify(Array.from({ length: 501 }, () => exact)), "JSON").error).toContain("Maximum import size");
  });
});

function validate(value: unknown) {
  const result = validateTaskImportRow(value);
  if (!result.success) throw new Error(result.errors.join(", "));
  return result.task;
}
