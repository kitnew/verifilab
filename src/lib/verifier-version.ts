import type { Verifier } from "@/lib/verifier";
import { storedVerifierSchema } from "@/lib/validation";

export type VerifierSnapshot = { verifierType: Verifier["type"]; verifierConfig: unknown };

export function normalizeVerifierSnapshot(input: VerifierSnapshot): VerifierSnapshot {
  const verifier = storedVerifierSchema.parse({ type: input.verifierType, config: input.verifierConfig });
  return { verifierType: verifier.type, verifierConfig: sortJson(verifier.config) };
}

export function verifierChanged(left: VerifierSnapshot, right: VerifierSnapshot) {
  return JSON.stringify(normalizeVerifierSnapshot(left)) !== JSON.stringify(normalizeVerifierSnapshot(right));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, item]) => [key, sortJson(item)]));
  }
  return value;
}
