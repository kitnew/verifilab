import { getDemoRole } from "@/lib/demo-role";
import { runEvaluationBatch } from "@/lib/evaluation-service";
import { can } from "@/lib/review";

export async function POST(_: Request, { params }: { params: Promise<{ batchId: string }> }) {
  if (!can(await getDemoRole(), "CREATE_TASK")) return Response.json({ error: "Your demo role cannot run evaluations." }, { status: 403 });
  const { batchId } = await params;
  const result = await runEvaluationBatch(batchId);
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
