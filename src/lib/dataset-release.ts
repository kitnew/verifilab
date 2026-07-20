import { z } from "zod";
import { datasetExportItems } from "@/lib/dataset";

export const releaseSplits = ["train", "validation", "test"] as const;
export type ReleaseSplit = (typeof releaseSplits)[number];
export type ReleaseExportScope = ReleaseSplit | "all";
export type DatasetExportItem = ReturnType<typeof datasetExportItems>[number];
export const datasetReleaseItemSchema = z.object({ taskId: z.string(), title: z.string(), prompt: z.string(), verifierType: z.string(), verifierConfig: z.unknown(), difficulty: z.string(), tags: z.array(z.unknown()), project: z.object({ id: z.string(), name: z.string(), description: z.string() }), split: z.enum(releaseSplits) });
export type DatasetReleaseItem = z.infer<typeof datasetReleaseItemSchema>;

const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export const splitPercentagesSchema = z.object({
  trainPercentage: z.number().int().min(0).max(100),
  validationPercentage: z.number().int().min(0).max(100),
  testPercentage: z.number().int().min(0).max(100),
}).superRefine((value, context) => {
  if (value.trainPercentage + value.validationPercentage + value.testPercentage !== 100) context.addIssue({ code: "custom", message: "Split percentages must total exactly 100%." });
});

export const datasetReleaseSchema = z.object({
  version: z.string().trim().regex(semver, "Enter a valid semantic version such as 1.0.0."),
  notes: z.string().trim().max(2_000).default(""),
  seed: z.string().trim().min(1, "Seed is required.").max(100),
  trainPercentage: z.number().int().min(0).max(100),
  validationPercentage: z.number().int().min(0).max(100),
  testPercentage: z.number().int().min(0).max(100),
}).superRefine((value, context) => {
  const percentages = splitPercentagesSchema.safeParse(value);
  if (!percentages.success) context.addIssue({ code: "custom", path: ["trainPercentage"], message: percentages.error.issues[0].message });
});

export type DatasetReleaseInput = z.input<typeof datasetReleaseSchema>;

export function releaseSplitCounts(total: number, percentages: z.input<typeof splitPercentagesSchema>) {
  const count = z.number().int().nonnegative().parse(total);
  const valid = splitPercentagesSchema.parse(percentages);
  const values = releaseSplits.map((split, index) => {
    const raw = count * valid[`${split}Percentage`] / 100;
    return { split, index, count: Math.floor(raw), remainder: raw - Math.floor(raw) };
  });
  let remaining = count - values.reduce((sum, value) => sum + value.count, 0);
  for (const value of [...values].sort((left, right) => right.remainder - left.remainder || left.index - right.index)) {
    if (!remaining) break;
    value.count += 1;
    remaining -= 1;
  }
  return { train: values[0].count, validation: values[1].count, test: values[2].count };
}

export function createDatasetReleaseItems(items: DatasetExportItem[], percentages: z.input<typeof splitPercentagesSchema>, seed: string): DatasetReleaseItem[] {
  const counts = releaseSplitCounts(items.length, percentages);
  return [...items]
    .sort((left, right) => seededRank(seed, left.taskId) - seededRank(seed, right.taskId) || left.taskId.localeCompare(right.taskId))
    .map((item, index) => ({ ...structuredClone(item), split: index < counts.train ? "train" : index < counts.train + counts.validation ? "validation" : "test" }));
}

export function releaseVersionIsUnique(existingVersions: string[], version: string) {
  return !existingVersions.includes(version);
}

export function serializeDatasetRelease(items: DatasetReleaseItem[], scope: ReleaseExportScope) {
  const order: Record<ReleaseSplit, number> = { train: 0, validation: 1, test: 2 };
  const selected = items.filter((item) => scope === "all" || item.split === scope).sort((left, right) => order[left.split] - order[right.split] || left.taskId.localeCompare(right.taskId));
  return selected.map((item) => JSON.stringify(item)).join("\n") + (selected.length ? "\n" : "");
}

export function datasetReleaseFilename(datasetName: string, version: string, scope: ReleaseExportScope) {
  const dataset = slug(datasetName) || "dataset";
  const release = slug(version) || "release";
  return `verifilab-${dataset}-${release}-${scope}.jsonl`;
}

export function datasetReleaseContentDisposition(datasetName: string, version: string, scope: ReleaseExportScope) {
  return `attachment; filename="${datasetReleaseFilename(datasetName, version, scope)}"`;
}

function seededRank(seed: string, taskId: string) {
  // ponytail: 32-bit FNV ranking is enough for local dataset splits; task ID breaks rare collisions deterministically.
  let hash = 2_166_136_261;
  for (const character of `${seed}\0${taskId}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
  return hash >>> 0;
}

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
