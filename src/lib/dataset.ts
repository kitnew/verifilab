import { z } from "zod";

export const datasetSchema = z.object({
  projectId: z.string().trim().min(1, "Project is required"),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  description: z.string().trim().max(500).default(""),
});
export const datasetUpdateSchema = datasetSchema.omit({ projectId: true });

export const datasetTaskIdsSchema = z.array(z.string().min(1)).min(1, "Select at least one task").max(500);

export type DatasetInput = z.input<typeof datasetSchema>;
export type ExportFormat = "json" | "jsonl";

type ExportableTask = {
  id: string;
  title: string;
  prompt: string;
  verifierType: string;
  verifierConfig: unknown;
  difficulty: string;
  tags: unknown;
  project: { id: string; name: string; description: string };
};

export type PositionedTask = { position: number; task: ExportableTask };

export function isDatasetEligible(task: { status: string; projectId: string }, datasetProjectId: string) {
  return task.status === "APPROVED" && task.projectId === datasetProjectId;
}

export function datasetExportItems(items: PositionedTask[]) {
  return [...items]
    .sort((left, right) => left.position - right.position || left.task.id.localeCompare(right.task.id))
    .map(({ task }) => ({
      taskId: task.id,
      title: task.title,
      prompt: task.prompt,
      verifierType: task.verifierType,
      verifierConfig: task.verifierConfig,
      difficulty: task.difficulty,
      tags: Array.isArray(task.tags) ? task.tags : [],
      project: task.project,
    }));
}

export function serializeDataset(items: PositionedTask[], format: ExportFormat) {
  const exported = datasetExportItems(items);
  return format === "jsonl"
    ? exported.map((item) => JSON.stringify(item)).join("\n") + (exported.length ? "\n" : "")
    : `${JSON.stringify(exported, null, 2)}\n`;
}

export function datasetExportFilename(name: string, format: ExportFormat) {
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "dataset";
  return `${slug}.${format}`;
}

export function datasetContentDisposition(name: string, format: ExportFormat) {
  return `attachment; filename="${datasetExportFilename(name, format)}"`;
}
