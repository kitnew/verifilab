export const TASK_PAGE_SIZE = 10;

export const taskStatuses = ["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED"] as const;
export const taskDifficulties = ["EASY", "MEDIUM", "HARD"] as const;
export const taskVerifierTypes = ["EXACT_MATCH", "NUMERIC", "REGEX", "JSON_SCHEMA"] as const;
export const taskSorts = ["newest", "oldest", "title", "difficulty"] as const;

type SearchParams = Record<string, string | string[] | undefined>;

export type TaskSearch = {
  q: string;
  projectId: string;
  status: typeof taskStatuses[number] | "";
  difficulty: typeof taskDifficulties[number] | "";
  verifierType: typeof taskVerifierTypes[number] | "";
  tag: string;
  sort: typeof taskSorts[number];
  page: number;
};

export function parseTaskSearchParams(params: SearchParams): TaskSearch {
  const page = Number(single(params.page));

  return {
    q: text(params.q, 200),
    projectId: text(params.project, 100),
    status: pick(params.status, taskStatuses) ?? "",
    difficulty: pick(params.difficulty, taskDifficulties) ?? "",
    verifierType: pick(params.verifier, taskVerifierTypes) ?? "",
    tag: text(params.tag, 100),
    sort: pick(params.sort, taskSorts) ?? "newest",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export function taskSearchHref(search: TaskSearch, page: number) {
  const params = new URLSearchParams();
  if (search.q) params.set("q", search.q);
  if (search.projectId) params.set("project", search.projectId);
  if (search.status) params.set("status", search.status);
  if (search.difficulty) params.set("difficulty", search.difficulty);
  if (search.verifierType) params.set("verifier", search.verifierType);
  if (search.tag) params.set("tag", search.tag);
  if (search.sort !== "newest") params.set("sort", search.sort);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/dashboard/tasks${query ? `?${query}` : ""}`;
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function text(value: string | string[] | undefined, maxLength: number) {
  return single(value)?.trim().slice(0, maxLength) ?? "";
}

function pick<const T extends readonly string[]>(value: string | string[] | undefined, values: T) {
  const candidate = single(value);
  return values.includes(candidate as T[number]) ? candidate as T[number] : undefined;
}
