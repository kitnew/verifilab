import { evaluationBatchStatuses, evaluationResultStatuses } from "@/lib/evaluation";

export const EVALUATION_PAGE_SIZE = 10;
export const EVALUATION_RESULT_PAGE_SIZE = 20;
export const evaluationSorts = ["newest", "oldest"] as const;
export const evaluationResultSorts = ["sequence", "reward", "execution", "evaluated"] as const;
type Params = Record<string, string | string[] | undefined>;

export function parseEvaluationSearch(params: Params) {
  return {
    q: text(params.q, 200), projectId: text(params.project, 100), taskId: text(params.task, 100), model: text(params.model, 120),
    status: (pick(params.status, evaluationBatchStatuses) ?? "") as (typeof evaluationBatchStatuses)[number] | "",
    sort: pick(params.sort, evaluationSorts) ?? "newest",
    page: page(params.page),
  };
}

export function evaluationSearchHref(search: ReturnType<typeof parseEvaluationSearch>, pageNumber: number) {
  const params = new URLSearchParams();
  if (search.q) params.set("q", search.q); if (search.projectId) params.set("project", search.projectId); if (search.taskId) params.set("task", search.taskId); if (search.model) params.set("model", search.model); if (search.status) params.set("status", search.status); if (search.sort !== "newest") params.set("sort", search.sort); if (pageNumber > 1) params.set("page", String(pageNumber));
  return `/dashboard/evaluations${params.size ? `?${params}` : ""}`;
}

export function parseEvaluationResultSearch(params: Params) {
  return { q: text(params.q, 200), status: (pick(params.resultStatus, evaluationResultStatuses) ?? "") as (typeof evaluationResultStatuses)[number] | "", sort: pick(params.resultSort, evaluationResultSorts) ?? "sequence", page: page(params.resultPage) };
}

export function evaluationResultHref(batchId: string, search: ReturnType<typeof parseEvaluationResultSearch>, pageNumber: number) {
  const params = new URLSearchParams();
  if (search.q) params.set("q", search.q); if (search.status) params.set("resultStatus", search.status); if (search.sort !== "sequence") params.set("resultSort", search.sort); if (pageNumber > 1) params.set("resultPage", String(pageNumber));
  return `/dashboard/evaluations/${batchId}${params.size ? `?${params}` : ""}`;
}

function page(value: string | string[] | undefined) {
  const parsed = Number(single(value)); return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function text(value: string | string[] | undefined, max: number) { return single(value)?.trim().slice(0, max) ?? ""; }
function pick<const T extends readonly string[]>(value: string | string[] | undefined, options: T) { const candidate = single(value); return options.includes(candidate as T[number]) ? candidate as T[number] : undefined; }
