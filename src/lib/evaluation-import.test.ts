import { describe, expect, it } from "vitest";
import { MAX_EVALUATION_FILE_BYTES, MAX_EVALUATION_RESPONSES } from "./evaluation";
import { parseCsvImport, parseJsonlImport } from "./evaluation-import";

describe("JSONL evaluation import", () => {
  it("parses valid metadata, Unicode, and encoded multiline responses", () => {
    const preview = parseJsonlImport('{"response":"126","seed":42}\n{"response":"Привет\\nмир","externalId":"r-2","metadata":{"source":"manual"}}\n');
    expect(preview.invalid).toHaveLength(0);
    expect(preview.valid).toEqual([
      { response: "126", seed: 42 },
      { response: "Привет\nмир", externalId: "r-2", metadata: { source: "manual" } },
    ]);
  });

  it("reports malformed, missing, and mixed invalid lines independently", () => {
    const preview = parseJsonlImport('{"response":"yes"}\nnot-json\n{"seed":1}\n');
    expect(preview.valid).toHaveLength(1);
    expect(preview.invalid).toEqual([
      expect.objectContaining({ line: 2, error: "Malformed JSON." }),
      expect.objectContaining({ line: 3, error: "Response is required." }),
    ]);
  });

  it("detects duplicate responses without removing them", () => {
    const preview = parseJsonlImport('{"response":" yes "}\n{"response":"yes"}\n');
    expect(preview.valid).toHaveLength(2);
    expect(preview.duplicateCount).toBe(1);
  });
});

describe("CSV evaluation import", () => {
  it("supports quoted commas, quotes, Unicode, and multiline values", () => {
    const csv = 'response,externalId,metadata\r\n"hello, ""world""\nПривет",r-1,"{""kind"":""demo""}"\r\n';
    const preview = parseCsvImport(csv);
    expect(preview.error).toBeUndefined();
    expect(preview.invalid).toHaveLength(0);
    expect(preview.valid[0]).toEqual({ response: 'hello, "world"\nПривет', externalId: "r-1", metadata: { kind: "demo" } });
  });

  it("validates headers and rows", () => {
    expect(parseCsvImport("answer\n42\n").error).toBe("CSV must include a response header.");
    const mixed = parseCsvImport("response,seed\nyes,42\nno,not-an-int\n");
    expect(mixed.valid).toHaveLength(1);
    expect(mixed.invalid[0]).toMatchObject({ line: 3, error: "Seed must be an integer." });
  });
});

it("enforces file size and response count limits", () => {
  expect(parseJsonlImport("x".repeat(MAX_EVALUATION_FILE_BYTES + 1)).error).toContain("File exceeds");
  const rows = Array.from({ length: MAX_EVALUATION_RESPONSES + 1 }, () => '{"response":"x"}').join("\n");
  expect(parseJsonlImport(rows).error).toBe(`Maximum batch size is ${MAX_EVALUATION_RESPONSES}.`);
});
