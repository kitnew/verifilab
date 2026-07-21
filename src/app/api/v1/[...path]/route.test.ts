import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), taskFindMany: vi.fn(), datasetFindFirst: vi.fn(), jobFindFirst: vi.fn(), createTask: vi.fn(), runVerification: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/api-token", () => ({ apiError: (status: number, code: string, message: string, details?: unknown) => Response.json({ error: { code, message, ...(details === undefined ? {} : { details }) } }, { status }), authenticateApiToken: mocks.authenticate }));
vi.mock("@/lib/prisma", () => ({ prisma: { task: { findMany: mocks.taskFindMany }, dataset: { findFirst: mocks.datasetFindFirst }, asyncJob: { findFirst: mocks.jobFindFirst } } }));
vi.mock("@/lib/task-service", () => ({ createTaskRecord: mocks.createTask }));
vi.mock("@/lib/verification-service", () => ({ runVerificationRecord: mocks.runVerification }));

import { GET, POST } from "./route";

const auth = { ok: true as const, token: { id: "token", projectId: "project-1", prefix: "vfl_prefix", scopes: [] } };
const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
const request = (path: string, init?: RequestInit) => new Request(`http://localhost/api/v1/${path}`, { headers: { Authorization: "Bearer vfl_token", ...(init?.body ? { "Content-Type": "application/json" } : {}) }, ...init });

describe("API v1 routes", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.authenticate.mockResolvedValue(auth); });

  it("returns project tasks through the real route", async () => {
    mocks.taskFindMany.mockResolvedValue([{ id: "task-1", title: "Task" }]);
    const response = await GET(request("tasks"), context(["tasks"]));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ data: [{ id: "task-1", title: "Task" }] });
    expect(mocks.taskFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: "project-1" } }));
  });

  it("creates tasks with the shared task service", async () => {
    mocks.createTask.mockResolvedValue({ task: { id: "task-2" } });
    const response = await POST(request("tasks", { method: "POST", body: JSON.stringify({ title: "API task" }) }), context(["tasks"]));
    expect(response.status).toBe(201); expect(await response.json()).toEqual({ data: { id: "task-2" } });
  });

  it("runs verification with the shared verification service", async () => {
    mocks.runVerification.mockResolvedValue({ result: { passed: true, reward: 1 } });
    const response = await POST(request("verifications", { method: "POST", body: JSON.stringify({ taskId: "task-1", candidate: "hello" }) }), context(["verifications"]));
    expect(response.status).toBe(200); expect(mocks.runVerification).toHaveBeenCalledWith("project-1", "task-1", "hello");
  });

  it("enforces project isolation for datasets", async () => {
    mocks.datasetFindFirst.mockResolvedValue(null);
    const response = await GET(request("datasets/other"), context(["datasets", "other"]));
    expect(response.status).toBe(404);
    expect(mocks.datasetFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "other", projectId: "project-1" } }));
  });

  it("returns safe job data and structured authentication errors", async () => {
    mocks.jobFindFirst.mockResolvedValue({ id: "job-1", status: "COMPLETED" });
    expect((await GET(request("jobs/job-1"), context(["jobs", "job-1"]))).status).toBe(200);
    mocks.authenticate.mockResolvedValueOnce({ ok: false, response: Response.json({ error: { code: "unauthorized", message: "Invalid" } }, { status: 401 }) });
    const denied = await GET(request("jobs/job-1"), context(["jobs", "job-1"]));
    expect(denied.status).toBe(401); expect(await denied.json()).toEqual({ error: { code: "unauthorized", message: "Invalid" } });
  });
});
