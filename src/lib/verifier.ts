import Ajv, { type AnySchema, type ErrorObject, type ValidateFunction } from "ajv";

const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });

export type Verifier =
  | {
      type: "EXACT_MATCH";
      config: { expected: string; caseSensitive?: boolean; trimWhitespace?: boolean };
    }
  | { type: "NUMERIC"; config: { expected: number; tolerance: number } }
  | { type: "REGEX"; config: { pattern: string; flags?: string } }
  | { type: "JSON_SCHEMA"; config: { schema: unknown } };

export type StructuredValidationError = {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  message: string;
  params: Record<string, unknown>;
};

export type VerificationResult = {
  passed: boolean;
  reward: 0 | 1;
  details: string;
  normalizedCandidate?: string;
  validationErrors?: StructuredValidationError[];
  executionTimeMs: number;
};

export function compileJsonSchema(schema: unknown): ValidateFunction {
  const validate = ajv.compile(schema as AnySchema);
  if ("$async" in validate && validate.$async) throw new Error("Async JSON Schemas are not supported.");
  return validate as ValidateFunction;
}

export function verify(candidate: string, verifier: Verifier): VerificationResult {
  const startedAt = performance.now();
  let passed = false;
  let details: string;
  let normalizedCandidate: string | undefined;
  let validationErrors: StructuredValidationError[] | undefined;

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
  } else if (verifier.type === "REGEX") {
    try {
      passed = new RegExp(verifier.config.pattern, verifier.config.flags).test(candidate);
      details = passed ? "Candidate matches the regular expression." : "Candidate does not match the regular expression.";
    } catch {
      details = "Verifier configuration contains an invalid regular expression.";
    }
  } else {
    let value: unknown;
    try {
      value = JSON.parse(candidate);
    } catch {
      details = "Candidate is not valid JSON.";
      validationErrors = [{ instancePath: "", schemaPath: "", keyword: "parse", message: details, params: {} }];
      return result();
    }

    try {
      const validate = compileJsonSchema(verifier.config.schema);
      passed = validate(value);
      validationErrors = passed ? undefined : structuredErrors(validate.errors);
      details = passed ? "Candidate JSON satisfies the configured schema." : `Candidate JSON failed schema validation with ${validationErrors?.length ?? 0} error(s).`;
    } catch {
      details = "Verifier configuration contains an invalid JSON Schema.";
    }
  }

  return result();

  function result(): VerificationResult {
    return {
      passed,
      reward: passed ? 1 : 0,
      details,
      ...(normalizedCandidate === undefined ? {} : { normalizedCandidate }),
      ...(validationErrors === undefined ? {} : { validationErrors }),
      executionTimeMs: performance.now() - startedAt,
    };
  }
}

function structuredErrors(errors: ErrorObject[] | null | undefined): StructuredValidationError[] {
  return (errors ?? []).map((error) => ({
    instancePath: error.instancePath,
    schemaPath: error.schemaPath,
    keyword: error.keyword,
    message: error.message ?? "Schema validation failed.",
    params: { ...error.params },
  }));
}
