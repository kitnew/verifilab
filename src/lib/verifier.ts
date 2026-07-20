export type Verifier =
  | {
      type: "EXACT_MATCH";
      config: { expected: string; caseSensitive?: boolean; trimWhitespace?: boolean };
    }
  | { type: "NUMERIC"; config: { expected: number; tolerance: number } }
  | { type: "REGEX"; config: { pattern: string; flags?: string } };

export type VerificationResult = {
  passed: boolean;
  reward: 0 | 1;
  details: string;
  normalizedCandidate?: string;
  executionTimeMs: number;
};

export function verify(candidate: string, verifier: Verifier): VerificationResult {
  const startedAt = performance.now();
  let passed = false;
  let details: string;
  let normalizedCandidate: string | undefined;

  if (verifier.type === "EXACT_MATCH") {
    const { expected, caseSensitive = false, trimWhitespace = true } = verifier.config;
    const normalize = (value: string) => {
      const trimmed = trimWhitespace ? value.trim() : value;
      return caseSensitive ? trimmed : trimmed.toLowerCase();
    };
    normalizedCandidate = normalize(candidate);
    passed = normalizedCandidate === normalize(expected);
    details = passed ? "Candidate matches the expected answer." : "Candidate does not match the expected answer.";
  } else if (verifier.type === "NUMERIC") {
    const normalized = candidate.trim();
    const value = normalized === "" ? Number.NaN : Number(normalized);
    if (!Number.isFinite(value)) {
      details = "Candidate is not a valid finite number.";
    } else {
      const difference = Math.abs(value - verifier.config.expected);
      passed = difference <= verifier.config.tolerance;
      details = passed
        ? `Difference ${difference} is within tolerance ${verifier.config.tolerance}.`
        : `Difference ${difference} exceeds tolerance ${verifier.config.tolerance}.`;
    }
  } else {
    try {
      passed = new RegExp(verifier.config.pattern, verifier.config.flags).test(candidate);
      details = passed ? "Candidate matches the regular expression." : "Candidate does not match the regular expression.";
    } catch {
      details = "Verifier configuration contains an invalid regular expression.";
    }
  }

  return {
    passed,
    reward: passed ? 1 : 0,
    details,
    ...(normalizedCandidate === undefined ? {} : { normalizedCandidate }),
    executionTimeMs: performance.now() - startedAt,
  };
}
