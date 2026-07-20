import { describe, expect, it } from "vitest";
import { normalizeVerifierSnapshot, verifierChanged } from "./verifier-version";

describe("verifier version domain", () => {
  it("normalizes complete snapshots and ignores object key order", () => {
    const initial = normalizeVerifierSnapshot({ verifierType: "EXACT_MATCH", verifierConfig: { trimWhitespace: true, expected: "yes", caseSensitive: false } });
    expect(initial).toEqual({ verifierType: "EXACT_MATCH", verifierConfig: { caseSensitive: false, expected: "yes", trimWhitespace: true } });
    expect(verifierChanged(initial, { verifierType: "EXACT_MATCH", verifierConfig: { expected: "yes", caseSensitive: false, trimWhitespace: true } })).toBe(false);
  });

  it("detects material type and configuration changes", () => {
    expect(verifierChanged(
      { verifierType: "NUMERIC", verifierConfig: { expected: 42, tolerance: 0 } },
      { verifierType: "NUMERIC", verifierConfig: { expected: 42, tolerance: 0.1 } },
    )).toBe(true);
    expect(verifierChanged(
      { verifierType: "EXACT_MATCH", verifierConfig: { expected: "42", caseSensitive: false, trimWhitespace: true } },
      { verifierType: "NUMERIC", verifierConfig: { expected: 42, tolerance: 0 } },
    )).toBe(true);
  });

  it("rejects invalid configurations before persistence", () => {
    expect(() => normalizeVerifierSnapshot({ verifierType: "REGEX", verifierConfig: { pattern: "[", flags: "" } })).toThrow();
  });
});
