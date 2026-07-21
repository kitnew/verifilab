/* global __ENV */
import http from "k6/http";
import exec from "k6/execution";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";

const PROFILE = __ENV.VFL_PROFILE || "smoke";
const SCENARIO = __ENV.VFL_SCENARIO || "all";
const BASE_URL = (__ENV.VFL_BASE_URL || "").replace(/\/+$/, "");
const TOKEN = __ENV.VFL_API_TOKEN || "";
const PROJECT_ID = __ENV.VFL_PROJECT_ID || "token-project";
const TASK_ID = __ENV.VFL_TASK_ID || "";
const DATASET_ID = __ENV.VFL_DATASET_ID || "";
const JOB_ID = __ENV.VFL_JOB_ID || "";
const RUN_ID = __ENV.VFL_RUN_ID || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const DURATION = duration("VFL_DURATION", PROFILE === "smoke" ? "10s" : "30s");
const VUS = integer("VFL_VUS", PROFILE === "smoke" ? 1 : PROFILE === "baseline" ? 10 : 25);
const TARGET_RATE = integer("VFL_TARGET_RATE", PROFILE === "smoke" ? 1 : PROFILE === "baseline" ? 10 : 20);
const WRITE_ITERATIONS = integer("VFL_WRITE_ITERATIONS", PROFILE === "smoke" ? 1 : PROFILE === "baseline" ? 10 : 25);
const VERIFY_BATCH_SIZE = integer("VFL_VERIFY_BATCH_SIZE", 3);
const SLEEP_SECONDS = decimal("VFL_SLEEP_SECONDS", 0.2, 0);
const MAX_ERROR_RATE = decimal("VFL_MAX_ERROR_RATE", 0.01, 0, 1);
const P95_MS = decimal("VFL_P95_MS", 750, 1);
const MIN_CHECK_RATE = decimal("VFL_MIN_CHECK_RATE", 0.99, 0, 1);
const CANDIDATE = __ENV.VFL_CANDIDATE || "load-test-candidate";

if (!["smoke", "baseline", "stress"].includes(PROFILE)) throw new Error("VFL_PROFILE must be smoke, baseline, or stress.");
if (!["all", "health", "tasks", "create", "verify", "mixed"].includes(SCENARIO)) throw new Error("VFL_SCENARIO must be all, health, tasks, create, verify, or mixed.");

const requestsSucceeded = new Counter("requests_succeeded");
const requestsFailed = new Counter("requests_failed");

export const options = {
  scenarios: scenarios(),
  thresholds: {
    http_req_failed: [`rate<${MAX_ERROR_RATE}`],
    http_req_duration: [`p(95)<${P95_MS}`],
    checks: [`rate>${MIN_CHECK_RATE}`],
  },
};

export function setup() {
  if (!BASE_URL) throw new Error("VFL_BASE_URL is required, for example http://localhost:3000.");
  if (!TOKEN) throw new Error("VFL_API_TOKEN is required.");
  if (writesEnabled() && __ENV.VFL_ALLOW_WRITES !== "true") throw new Error("Write scenarios require VFL_ALLOW_WRITES=true. They create tasks and verification runs.");
  if (verificationEnabled() && !TASK_ID) throw new Error("VFL_TASK_ID is required for verify, mixed, or all scenarios.");

  const ready = tracked("GET", "/login", null, "GET /login", "readiness", false);
  if (ready.status !== 200) throw new Error(`Readiness prerequisite failed: GET /login returned ${ready.status}.`);
  const tasks = tracked("GET", "/api/v1/tasks", null, "GET /api/v1/tasks", "prerequisite");
  if (tasks.status !== 200) throw new Error(`API prerequisite failed: GET /api/v1/tasks returned ${tasks.status}. Check the token and tasks:read scope.`);
  const listed = data(tasks);
  if (!listed) throw new Error("API prerequisite failed: GET /api/v1/tasks did not return { data: [] }.");
  if (TASK_ID && !listed.some((task) => task && task.id === TASK_ID)) throw new Error("VFL_TASK_ID was not found in the token project's newest 100 tasks.");
  if (DATASET_ID) prerequisite(`/api/v1/datasets/${encodeURIComponent(DATASET_ID)}`, "dataset", "datasets:read");
  if (JOB_ID) prerequisite(`/api/v1/jobs/${encodeURIComponent(JOB_ID)}`, "job", "jobs:read");
  return { runId: RUN_ID };
}

export function healthCheck() {
  const response = tracked("GET", "/login", null, "GET /login", "readiness", false);
  check(response, { "readiness returned 200": (value) => value.status === 200 });
  pause();
}

export function taskReads() {
  const statuses = ["DRAFT", "IN_PROGRESS", "IN_REVIEW", "APPROVED"];
  const status = statuses[exec.scenario.iterationInTest % statuses.length];
  const response = tracked("GET", `/api/v1/tasks?status=${status}`, null, "GET /api/v1/tasks?status=:status", "task-read");
  check(response, { "task list returned data": (value) => value.status === 200 && data(value) !== null });
  pause();
}

export function createTasks(context) {
  const unique = `${context.runId}-${exec.vu.idInTest}-${exec.scenario.iterationInTest}`;
  const response = tracked("POST", "/api/v1/tasks", {
    title: `Load baseline ${PROJECT_ID} ${unique}`.slice(0, 120),
    prompt: `Return exactly load-${unique}.`,
    verifierType: "EXACT_MATCH",
    difficulty: "EASY",
    status: "DRAFT",
    tags: `load-test,${context.runId}`,
    expectedText: `load-${unique}`,
  }, "POST /api/v1/tasks", "task-write");
  check(response, { "task creation returned 201": (value) => value.status === 201 });
  pause();
}

export function batchVerification() {
  for (let index = 0; index < VERIFY_BATCH_SIZE; index += 1) {
    const response = tracked("POST", "/api/v1/verifications", { taskId: TASK_ID, candidate: CANDIDATE }, "POST /api/v1/verifications", "verification");
    check(response, { "verification returned 200": (value) => value.status === 200 });
  }
  pause();
}

export function mixedContributor() {
  const choice = Math.random();
  if (choice < 0.55) taskReads();
  else if (choice < 0.75) {
    const response = tracked("GET", "/api/v1/tasks", null, "GET /api/v1/tasks", "mixed-read");
    check(response, { "mixed task list succeeded": (value) => value.status === 200 && data(value) !== null });
    pause();
  } else if (choice < 0.95) batchVerification();
  else if (DATASET_ID) optionalRead(`/api/v1/datasets/${encodeURIComponent(DATASET_ID)}`, "GET /api/v1/datasets/:id");
  else if (JOB_ID) optionalRead(`/api/v1/jobs/${encodeURIComponent(JOB_ID)}`, "GET /api/v1/jobs/:id");
  else taskReads();
}

export function handleSummary(summary) {
  const total = value(summary, "http_reqs", "count");
  const succeeded = value(summary, "requests_succeeded", "count");
  const failed = value(summary, "requests_failed", "count");
  const thresholds = Object.values(summary.metrics).flatMap((metric) => Object.values(metric.thresholds || {}));
  const passedThresholds = thresholds.filter((threshold) => threshold.ok).length;
  const failedThresholds = thresholds.length - passedThresholds;
  return { stdout: [
    "\nVerifiLab load-test summary",
    `profile=${PROFILE} scenario=${SCENARIO} run=${RUN_ID}`,
    `requests=${total} succeeded=${succeeded} failed=${failed} throughput=${fixed(value(summary, "http_reqs", "rate"))} req/s`,
    `latency p50=${fixed(value(summary, "http_req_duration", "med"))} ms p95=${fixed(value(summary, "http_req_duration", "p(95)"))} ms p99=${fixed(value(summary, "http_req_duration", "p(99)"))} ms`,
    `thresholds passed=${passedThresholds} failed=${failedThresholds}`,
    failedThresholds ? "RESULT: FAILED" : "RESULT: PASSED",
    "",
  ].join("\n") };
}

function scenarios() {
  const selected = (name) => SCENARIO === "all" || SCENARIO === name;
  const result = {};
  if (PROFILE === "smoke") {
    add(result, selected("health"), "health", iterations("healthCheck", 1));
    add(result, selected("tasks"), "tasks", iterations("taskReads", 2));
    add(result, selected("create"), "create", iterations("createTasks", WRITE_ITERATIONS));
    add(result, selected("verify"), "verify", iterations("batchVerification", 1));
    add(result, selected("mixed"), "mixed", iterations("mixedContributor", 3));
    return result;
  }
  if (PROFILE === "baseline") {
    add(result, selected("health"), "health", constant("healthCheck", 1));
    add(result, selected("tasks"), "tasks", constant("taskReads", Math.max(1, Math.ceil(VUS * 0.4))));
    add(result, selected("create"), "create", iterations("createTasks", WRITE_ITERATIONS, Math.max(1, Math.ceil(VUS * 0.2))));
    add(result, selected("verify"), "verify", constant("batchVerification", Math.max(1, Math.ceil(VUS * 0.2))));
    add(result, selected("mixed"), "mixed", arrival("mixedContributor"));
    return result;
  }
  add(result, selected("health"), "health", constant("healthCheck", 1));
  add(result, selected("tasks"), "tasks", ramp("taskReads", Math.max(1, Math.ceil(VUS * 0.5))));
  add(result, selected("create"), "create", iterations("createTasks", WRITE_ITERATIONS, Math.max(1, Math.ceil(VUS * 0.2))));
  add(result, selected("verify"), "verify", ramp("batchVerification", Math.max(1, Math.ceil(VUS * 0.25))));
  add(result, selected("mixed"), "mixed", ramp("mixedContributor", VUS));
  return result;
}

function add(target, enabled, name, config) { if (enabled) target[name] = config; }
function iterations(execName, count, vus = 1) { return { executor: "shared-iterations", exec: execName, vus, iterations: count, maxDuration: DURATION }; }
function constant(execName, vus) { return { executor: "constant-vus", exec: execName, vus, duration: DURATION, gracefulStop: "5s" }; }
function arrival(execName) { return { executor: "constant-arrival-rate", exec: execName, rate: TARGET_RATE, timeUnit: "1s", duration: DURATION, preAllocatedVUs: VUS, maxVUs: VUS * 2 }; }
function ramp(execName, target) { return { executor: "ramping-vus", exec: execName, startVUs: 0, stages: [{ duration: DURATION, target: Math.ceil(target / 2) }, { duration: DURATION, target }, { duration: DURATION, target: target * 2 }, { duration: DURATION, target: 0 }], gracefulRampDown: "5s" }; }

function tracked(method, path, body, name, workflow, authenticated = true) {
  const response = http.request(method, `${BASE_URL}${path}`, body === null ? null : JSON.stringify(body), { headers: { ...(authenticated ? { Authorization: `Bearer ${TOKEN}` } : {}), ...(body === null ? {} : { "Content-Type": "application/json" }) }, tags: { name, workflow } });
  if (response.status >= 200 && response.status < 400) requestsSucceeded.add(1); else requestsFailed.add(1);
  return response;
}

function optionalRead(path, name) { const response = tracked("GET", path, null, name, "mixed-read"); check(response, { [`${name} succeeded`]: (value) => value.status === 200 }); pause(); }
function prerequisite(path, resource, scope) { const response = tracked("GET", path, null, `GET /api/v1/${resource}s/:id`, "prerequisite"); if (response.status !== 200) throw new Error(`${resource} prerequisite failed with ${response.status}. Check the ID, project isolation, and ${scope} scope.`); }
function data(response) { try { const parsed = response.json(); return parsed && Array.isArray(parsed.data) ? parsed.data : null; } catch { return null; } }
function pause() { if (SLEEP_SECONDS > 0) sleep(SLEEP_SECONDS); }
function writesEnabled() { return ["all", "create", "verify", "mixed"].includes(SCENARIO); }
function verificationEnabled() { return ["all", "verify", "mixed"].includes(SCENARIO); }
function value(summary, metric, key) { return summary.metrics[metric] && summary.metrics[metric].values[key] || 0; }
function fixed(number) { return Number(number || 0).toFixed(2); }
function integer(name, fallback) { const parsed = Number(__ENV[name] || fallback); if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`); return parsed; }
function decimal(name, fallback, minimum, maximum = Infinity) { const parsed = Number(__ENV[name] || fallback); if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name} must be between ${minimum} and ${maximum}.`); return parsed; }
function duration(name, fallback) { const parsed = __ENV[name] || fallback; if (!/^\d+(ms|s|m|h)$/.test(parsed)) throw new Error(`${name} must look like 500ms, 30s, 2m, or 1h.`); return parsed; }
