import { describe, expect, it } from "vitest";
import { verify } from "./verifier";

describe("EXACT_MATCH", () => {
  it("normalizes case and surrounding whitespace by default", () => {
    const result = verify("  BuCHaRest\n", {
      type: "EXACT_MATCH",
      config: { expected: "Bucharest" },
    });

    expect(result).toMatchObject({ passed: true, reward: 1, normalizedCandidate: "bucharest" });
  });

  it("can preserve case", () => {
    expect(
      verify("answer", {
        type: "EXACT_MATCH",
        config: { expected: "Answer", caseSensitive: true },
      }).passed,
    ).toBe(false);
  });

  it("can preserve whitespace", () => {
    const result = verify(" answer ", {
      type: "EXACT_MATCH",
      config: { expected: "answer", trimWhitespace: false },
    });

    expect(result).toMatchObject({ passed: false, reward: 0, normalizedCandidate: " answer " });
  });

  it("does not collapse internal whitespace", () => {
    expect(
      verify("two  words", { type: "EXACT_MATCH", config: { expected: "two words" } }).passed,
    ).toBe(false);
  });
});

describe("NUMERIC", () => {
  it("passes values on the absolute-tolerance boundary", () => {
    expect(
      verify("10.5", { type: "NUMERIC", config: { expected: 10, tolerance: 0.5 } }),
    ).toMatchObject({ passed: true, reward: 1 });
  });

  it("fails values outside the absolute tolerance", () => {
    const result = verify("10.5001", {
      type: "NUMERIC",
      config: { expected: 10, tolerance: 0.5 },
    });

    expect(result.passed).toBe(false);
    expect(result.details).toContain("exceeds tolerance");
  });

  it.each(["", "   ", "not a number", "Infinity", "NaN"])(
    "returns a validation error for %j",
    (candidate) => {
      const result = verify(candidate, {
        type: "NUMERIC",
        config: { expected: 0, tolerance: 0 },
      });

      expect(result).toMatchObject({
        passed: false,
        reward: 0,
        details: "Candidate is not a valid finite number.",
      });
    },
  );

  it("accepts signed and scientific notation", () => {
    expect(
      verify(" -1.25e2 ", { type: "NUMERIC", config: { expected: -125, tolerance: 0 } }).passed,
    ).toBe(true);
  });
});

describe("REGEX", () => {
  it("tests the candidate with configured flags", () => {
    expect(
      verify("Ticket-ABC-42", {
        type: "REGEX",
        config: { pattern: "^ticket-[a-z]+-\\d+$", flags: "i" },
      }).passed,
    ).toBe(true);
  });

  it("returns a normal failure for a non-match", () => {
    const result = verify("ABC", { type: "REGEX", config: { pattern: "^\\d+$" } });
    expect(result).toMatchObject({ passed: false, reward: 0 });
    expect(result.details).toContain("does not match");
  });

  it("handles invalid patterns without throwing", () => {
    expect(
      verify("anything", { type: "REGEX", config: { pattern: "[" } }),
    ).toMatchObject({
      passed: false,
      reward: 0,
      details: "Verifier configuration contains an invalid regular expression.",
    });
  });

  it("does not leak state when using the global flag", () => {
    const verifier = { type: "REGEX" as const, config: { pattern: "a", flags: "g" } };
    expect(verify("a", verifier).passed).toBe(true);
    expect(verify("a", verifier).passed).toBe(true);
  });
});

it("always reports a non-negative execution time", () => {
  const result = verify("ok", { type: "EXACT_MATCH", config: { expected: "ok" } });
  expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
});
