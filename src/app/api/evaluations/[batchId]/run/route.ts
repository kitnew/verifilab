import { getCurrentUser, getProjectActor } from "@/lib/auth";
import { runEvaluationBatch } from "@/lib/evaluation-service";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/review";

export async function POST(_: Request, { params }: { params: Promise<{ batchId: string }> }) {
  if (!await getCurrentUser()) return Response.json({ error: "Authentication required." }, { status: 401 });
  const { batchId } = await params;
  const batch = await prisma.evaluationBatch.findUnique({ where: { id: batchId }, select: { task: { select: { projectId: true } } } });
  if (!batch) return Response.json({ error: "Evaluation batch not found." }, { status: 404 });
  const actor = await getProjectActor(batch.task.projectId);
  if (!actor || !can(actor.role, "CREATE_TASK")) return Response.json({ error: "Your account cannot run evaluations." }, { status: 403 });
  const result = await runEvaluationBatch(batchId);
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
