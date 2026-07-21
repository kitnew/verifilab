# VerifiLab load-testing baseline

This suite measures one VerifiLab environment with reproducible k6 profiles. Results describe only the tested commit, database, host, configuration and dataset. They are a baseline for comparison, not evidence that VerifiLab supports 1,000 concurrent contributors or any other production capacity.

## Prerequisites

1. Install [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) and confirm `k6 version` works.
2. Start the target VerifiLab deployment and apply its migrations.
3. Use a dedicated test project. Writes are persistent and there is no automated cleanup endpoint.
4. Create an API token for that project with:
   - `tasks:read`
   - `tasks:write`
   - `verifications:run`
   - `datasets:read` when `VFL_DATASET_ID` is configured
   - `jobs:read` when `VFL_JOB_ID` is configured
5. Choose a recent task ID from that project. It must appear in the newest 100 tasks returned by `GET /api/v1/tasks`.

Never commit or paste the API token into a command checked into shell history. Prefer an ignored environment file or a temporary shell session.

```bash
export VFL_BASE_URL="http://localhost:3000"
export VFL_API_TOKEN="vfl_replace_with_test_token"
export VFL_TASK_ID="replace_with_test_task_id"
export VFL_PROJECT_ID="load-test-project"
export VFL_ALLOW_WRITES="true"
```

`VFL_ALLOW_WRITES=true` is deliberately required for task creation, verification and mixed workloads. Verification requests create `VerificationRun` records, even when the candidate fails its verifier.

## Profiles

### Smoke

Minimal validation: readiness, two task reads, one task creation, one three-request verification batch and three mixed iterations.

```bash
npm run load:smoke
```

### Baseline

Moderate concurrent traffic for `VFL_DURATION`. Reads and verification use configured VUs, task creation uses a bounded iteration count, and the mixed scenario uses `VFL_TARGET_RATE`.

```bash
VFL_VUS=10 VFL_TARGET_RATE=10 VFL_DURATION=1m npm run load:baseline
```

### Stress

Ramping VUs increase from half target to target to twice target, then return to zero. `VFL_DURATION` is the duration of each of the four ramp stages, not the total stress duration.

`VFL_VUS` is an input to each enabled ramped scenario, not a global concurrency ceiling. When `VFL_SCENARIO=all`, concurrent VUs from task reads, verification and the mixed workload are additive; use a single scenario first when sizing a target safely.

```bash
VFL_VUS=25 VFL_DURATION=30s npm run load:stress
```

Run one workflow when diagnosing a failure:

```bash
VFL_SCENARIO=tasks npm run load:baseline
VFL_SCENARIO=verify VFL_ALLOW_WRITES=true npm run load:baseline
```

Supported scenario values are `all`, `health`, `tasks`, `create`, `verify` and `mixed`.

## Configuration

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `VFL_BASE_URL` | yes | — | Target origin without a required trailing slash. |
| `VFL_API_TOKEN` | yes | — | Project-scoped `vfl_` bearer token. Never passed in a URL. |
| `VFL_PROFILE` | by npm script | `smoke` | `smoke`, `baseline` or `stress`. |
| `VFL_SCENARIO` | no | `all` | Restrict execution to one workflow. |
| `VFL_PROJECT_ID` | no | `token-project` | Label included in unique generated task titles; authorization comes from the token. |
| `VFL_TASK_ID` | verify/mixed/all | — | Recent task used for verification writes. |
| `VFL_DATASET_ID` | no | — | Dataset preflighted and sampled by mixed reads. |
| `VFL_JOB_ID` | no | — | Job preflighted and sampled by mixed reads. |
| `VFL_ALLOW_WRITES` | write scenarios | `false` | Must be exactly `true` to allow persistent writes. |
| `VFL_RUN_ID` | no | generated | Stable identifier for generated task names. Set it when correlating repeated runs. |
| `VFL_VUS` | no | `1`/`10`/`25` | Profile-dependent VU target. Stress peaks at twice this value per ramped scenario. |
| `VFL_TARGET_RATE` | no | `1`/`10`/`20` | Requests/second scheduled by the baseline mixed scenario. |
| `VFL_DURATION` | no | `10s` smoke, `30s` otherwise | Baseline duration, smoke max duration, or duration per stress stage. |
| `VFL_WRITE_ITERATIONS` | no | `1`/`10`/`25` | Hard cap for task creation iterations. |
| `VFL_VERIFY_BATCH_SIZE` | no | `3` | Verification requests issued per batch iteration. |
| `VFL_CANDIDATE` | no | `load-test-candidate` | Candidate submitted to the chosen verifier. A failed verifier result is still a successful HTTP workflow. |
| `VFL_SLEEP_SECONDS` | no | `0.2` | Think time after workflow iterations. |
| `VFL_MAX_ERROR_RATE` | no | `0.01` | `http_req_failed` threshold; value from 0 to 1. |
| `VFL_P95_MS` | no | `750` | Global p95 response-time threshold in milliseconds. |
| `VFL_MIN_CHECK_RATE` | no | `0.99` | Minimum successful check ratio. |

Numeric and duration inputs are validated before execution. Missing URLs, tokens, write acknowledgement, task IDs, inaccessible tasks, datasets or jobs stop the run with a direct error.

## Tested workflows

- **Readiness:** `GET /login`. This proves that the web process responds; it is not a deep database/dependency readiness probe.
- **Task reads:** `GET /api/v1/tasks` with realistic status query variants and response-shape checks.
- **Task writes:** `POST /api/v1/tasks` using unique `run + VU + iteration` names and exact-match verifiers.
- **Batch verification:** repeated `POST /api/v1/verifications` calls using the configured task.
- **Mixed contributor:** weighted task-list reads, verification writes, and optional dataset/job reads.

The current task-list API does not define server-side filter semantics. Status query variants exercise the public read route and cache/query path, but this suite does not claim to validate filtering correctness. The write endpoints do not expose idempotency keys, so generated identifiers prevent accidental naming collisions while `VFL_WRITE_ITERATIONS` bounds persistent data.

## Output and thresholds

Every run prints a compact final summary containing:

- total, successful and failed requests;
- request throughput;
- p50, p95 and p99 HTTP latency;
- passed and failed threshold counts;
- final `PASSED` or `FAILED` result.

The run exits unsuccessfully when any global threshold fails:

- HTTP error rate must remain below `VFL_MAX_ERROR_RATE`;
- p95 latency must remain below `VFL_P95_MS`;
- successful checks must remain above `VFL_MIN_CHECK_RATE`.

Compare runs only when the commit, target topology, seed data, profile, environment variables and k6 host are recorded. A lower latency on an empty local SQLite database is not evidence of production scalability.

## Known limitations

- k6 is a standalone developer tool, not an npm dependency.
- There is no dedicated deep readiness endpoint; `/login` checks process reachability only.
- Task filtering is not currently a server-side API contract.
- Batch verification represents rollout/evaluation pressure but does not call the session-authenticated evaluation UI endpoints.
- Created tasks and verification runs remain in the test project. Use a disposable project or remove them manually afterward.
- API token `lastUsedAt` writes add background database work to authenticated requests.
- Localhost runs can measure contention between k6 and the application rather than deployment capacity.
- This baseline contains no distributed generators, soak profile, autoscaling analysis or 1,000-contributor evidence.
