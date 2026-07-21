import { Prisma, PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { normalizeVerifierSnapshot } from "../src/lib/verifier-version";

const prisma = new PrismaClient();

async function main() {
  await prisma.project.deleteMany();
  const adminPasswordHash = process.env.BOOTSTRAP_ADMIN_PASSWORD ? await hashPassword(process.env.BOOTSTRAP_ADMIN_PASSWORD) : null;
  const demoUsers = await Promise.all([
    prisma.user.upsert({ where: { email: "admin@verifilab.local" }, update: { name: "Ada Admin", username: "admin", passwordHash: adminPasswordHash, isAdmin: true }, create: { id: "demo-admin", name: "Ada Admin", email: "admin@verifilab.local", username: "admin", passwordHash: adminPasswordHash, isAdmin: true } }),
    prisma.user.upsert({ where: { email: "author@verifilab.local" }, update: { name: "Ari Author" }, create: { id: "demo-author", name: "Ari Author", email: "author@verifilab.local" } }),
    prisma.user.upsert({ where: { email: "reviewer@verifilab.local" }, update: { name: "Riley Reviewer" }, create: { id: "demo-reviewer", name: "Riley Reviewer", email: "reviewer@verifilab.local" } }),
    prisma.user.upsert({ where: { email: "curator@verifilab.local" }, update: { name: "Casey Curator" }, create: { id: "demo-curator", name: "Casey Curator", email: "curator@verifilab.local" } }),
  ]);
  const [admin, author, reviewer, curator] = demoUsers;

  const stem = await prisma.project.create({
    data: {
      name: "STEM Reasoning Benchmark",
      description: "A curated set of deterministic math and science tasks for evaluator calibration.",
      memberships: { create: [
        { userId: admin.id, role: "ADMIN" },
        { userId: author.id, role: "AUTHOR" },
        { userId: reviewer.id, role: "REVIEWER" },
        { userId: curator.id, role: "CURATOR" },
      ] },
      tasks: {
        create: [
          {
            title: "Compound interest after three years",
            prompt: "A $1,000 deposit earns 5% interest compounded annually. What is its value after 3 years? Return only the amount rounded to two decimal places.",
            verifierType: "NUMERIC",
            verifierConfig: { expected: 1157.63, tolerance: 0.01 },
            difficulty: "MEDIUM",
            status: "APPROVED",
            tags: ["finance", "arithmetic"],
          },
          {
            title: "Capital of Romania",
            prompt: "What is the capital city of Romania? Return only the city name.",
            verifierType: "EXACT_MATCH",
            verifierConfig: { expected: "Bucharest", caseSensitive: false },
            difficulty: "EASY",
            status: "IN_REVIEW",
            tags: ["geography", "factual"],
          },
          {
            title: "ISO date extraction",
            prompt: "Extract the publication date from: Published on 2026-07-20. Return it as YYYY-MM-DD.",
            verifierType: "REGEX",
            verifierConfig: { pattern: "^2026-07-20$", flags: "" },
            difficulty: "EASY",
            status: "DRAFT",
            tags: ["formatting", "regex"],
          },
          {
            title: "Structured final answer",
            prompt: "Return a JSON object with an integer answer and a non-empty string explanation.",
            verifierType: "JSON_SCHEMA",
            verifierConfig: {
              schema: {
                type: "object",
                required: ["answer", "explanation"],
                properties: { answer: { type: "integer" }, explanation: { type: "string", minLength: 1 } },
                additionalProperties: false,
              },
            },
            difficulty: "MEDIUM",
            status: "DRAFT",
            tags: ["structured-output", "json"],
          },
        ],
      },
      auditEvents: {
        create: { action: "PROJECT_CREATED", metadata: { source: "seed" } },
      },
    },
  });

  const [numericTask, exactTask, regexTask, jsonTask] = await Promise.all([
    prisma.task.findFirstOrThrow({ where: { projectId: stem.id, title: "Compound interest after three years" } }),
    prisma.task.findFirstOrThrow({ where: { projectId: stem.id, title: "Capital of Romania" } }),
    prisma.task.findFirstOrThrow({ where: { projectId: stem.id, title: "ISO date extraction" } }),
    prisma.task.findFirstOrThrow({ where: { projectId: stem.id, title: "Structured final answer" } }),
  ]);

  await Promise.all([
    prisma.task.update({ where: { id: numericTask.id }, data: { assignedAuthorId: author.id, assignedReviewerId: reviewer.id, priority: "HIGH", authorAssignedAt: new Date("2026-07-18T08:00:00Z"), reviewerAssignedAt: new Date("2026-07-19T08:00:00Z"), submittedAt: new Date("2026-07-19T09:00:00Z"), completedAt: new Date("2026-07-19T10:00:00Z") } }),
    prisma.task.update({ where: { id: exactTask.id }, data: { assignedAuthorId: author.id, assignedReviewerId: reviewer.id, priority: "URGENT", dueDate: new Date("2026-07-22T23:59:59Z"), authorAssignedAt: new Date("2026-07-20T08:00:00Z"), reviewerAssignedAt: new Date("2026-07-20T09:00:00Z"), submittedAt: new Date("2026-07-20T10:00:00Z") } }),
    prisma.task.update({ where: { id: regexTask.id }, data: { assignedAuthorId: author.id, priority: "MEDIUM", dueDate: new Date("2026-07-20T23:59:59Z"), authorAssignedAt: new Date("2026-07-18T08:00:00Z") } }),
    prisma.task.update({ where: { id: jsonTask.id }, data: { assignedAuthorId: author.id, priority: "LOW", authorAssignedAt: new Date("2026-07-20T08:00:00Z") } }),
  ]);

  await prisma.verifierVersion.createMany({ data: [numericTask, exactTask, regexTask, jsonTask].map((task) => {
    const snapshot = normalizeVerifierSnapshot(task);
    return {
      taskId: task.id,
      version: 1,
      verifierType: snapshot.verifierType,
      verifierConfig: snapshot.verifierConfig as Prisma.InputJsonValue,
      changeSummary: "Initial version",
    };
  }) });
  const verifierVersions = await prisma.verifierVersion.findMany({ where: { taskId: { in: [numericTask.id, exactTask.id, regexTask.id, jsonTask.id] } } });
  const versionFor = (taskId: string) => verifierVersions.find((version) => version.taskId === taskId)!;

  await prisma.evaluationBatch.create({ data: {
    taskId: numericTask.id, name: "Numeric calibration", description: "Mixed numeric responses imported from JSONL.", status: "COMPLETED", sourceType: "JSONL", modelName: "demo-math-model", modelVersion: "v1", temperature: 0.2, seed: 42,
    requestedCount: 4, processedCount: 4, passedCount: 2, failedCount: 1, importInvalidCount: 1, invalidCount: 1, progress: 100, duplicateCount: 0,
    taskTitleSnapshot: numericTask.title, taskPromptSnapshot: numericTask.prompt, verifierTypeSnapshot: numericTask.verifierType, verifierConfigSnapshot: numericTask.verifierConfig as Prisma.InputJsonValue, taskUpdatedAtSnapshot: numericTask.updatedAt, createdBy: "AUTHOR", startedAt: new Date("2026-07-20T10:00:00Z"), completedAt: new Date("2026-07-20T10:00:01Z"), createdAt: new Date("2026-07-20T09:59:00Z"),
    results: { create: [
      { sequenceNumber: 1, candidateResponse: "1157.63", status: "PASSED", passed: true, reward: 1, details: "Difference 0 is within tolerance 0.01.", executionTimeMs: 0.12, evaluatedAt: new Date("2026-07-20T10:00:00Z"), modelName: "demo-math-model", modelVersion: "v1", temperature: 0.2, seed: 42 },
      { sequenceNumber: 2, candidateResponse: "1157.64", status: "PASSED", passed: true, reward: 1, details: "Difference 0.01 is within tolerance 0.01.", executionTimeMs: 0.15, evaluatedAt: new Date("2026-07-20T10:00:00Z"), modelName: "demo-math-model", modelVersion: "v1", temperature: 0.2, seed: 43 },
      { sequenceNumber: 3, candidateResponse: "1200", status: "FAILED", passed: false, reward: 0, details: "Difference 42.37 exceeds tolerance 0.01.", executionTimeMs: 0.1, evaluatedAt: new Date("2026-07-20T10:00:00Z"), modelName: "demo-math-model", modelVersion: "v1", temperature: 0.2, seed: 44 },
    ] },
  } });

  await prisma.evaluationBatch.create({ data: {
    taskId: exactTask.id, name: "Capital answer rollouts", status: "COMPLETED", sourceType: "MANUAL", modelName: "demo-chat-model", requestedCount: 3, processedCount: 3, passedCount: 2, failedCount: 1, progress: 100,
    taskTitleSnapshot: exactTask.title, taskPromptSnapshot: exactTask.prompt, verifierTypeSnapshot: exactTask.verifierType, verifierConfigSnapshot: exactTask.verifierConfig as Prisma.InputJsonValue, taskUpdatedAtSnapshot: exactTask.updatedAt, createdBy: "ADMIN", startedAt: new Date("2026-07-19T12:00:00Z"), completedAt: new Date("2026-07-19T12:00:01Z"), createdAt: new Date("2026-07-19T11:59:00Z"),
    results: { create: [
      { sequenceNumber: 1, candidateResponse: "Bucharest", status: "PASSED", passed: true, reward: 1, details: "Candidate matches the expected answer.", normalizedCandidate: "bucharest", executionTimeMs: 0.08, evaluatedAt: new Date("2026-07-19T12:00:00Z") },
      { sequenceNumber: 2, candidateResponse: " bucharest ", status: "PASSED", passed: true, reward: 1, details: "Candidate matches the expected answer.", normalizedCandidate: "bucharest", executionTimeMs: 0.09, evaluatedAt: new Date("2026-07-19T12:00:00Z") },
      { sequenceNumber: 3, candidateResponse: "Cluj", status: "FAILED", passed: false, reward: 0, details: "Candidate does not match the expected answer.", normalizedCandidate: "cluj", executionTimeMs: 0.07, evaluatedAt: new Date("2026-07-19T12:00:00Z") },
    ] },
  } });

  await prisma.evaluationBatch.create({ data: {
    taskId: regexTask.id, name: "Pending format evaluation", status: "DRAFT", sourceType: "BULK_TEXT", requestedCount: 2,
    taskTitleSnapshot: regexTask.title, taskPromptSnapshot: regexTask.prompt, verifierTypeSnapshot: regexTask.verifierType, verifierConfigSnapshot: regexTask.verifierConfig as Prisma.InputJsonValue, taskUpdatedAtSnapshot: regexTask.updatedAt, createdBy: "AUTHOR", createdAt: new Date("2026-07-18T09:00:00Z"),
    results: { create: [{ sequenceNumber: 1, candidateResponse: "2026-07-20" }, { sequenceNumber: 2, candidateResponse: "July 20, 2026" }] },
  } });

  await prisma.evaluationBatch.create({ data: {
    taskId: jsonTask.id, name: "Cancelled structured output run", status: "CANCELLED", sourceType: "CSV", modelName: "demo-json-model", requestedCount: 2, completedAt: new Date("2026-07-17T14:00:01Z"),
    taskTitleSnapshot: jsonTask.title, taskPromptSnapshot: jsonTask.prompt, verifierTypeSnapshot: jsonTask.verifierType, verifierConfigSnapshot: jsonTask.verifierConfig as Prisma.InputJsonValue, taskUpdatedAtSnapshot: jsonTask.updatedAt, createdBy: "AUTHOR", createdAt: new Date("2026-07-17T14:00:00Z"),
    results: { create: [{ sequenceNumber: 1, candidateResponse: "{\"answer\":42,\"explanation\":\"ok\"}" }, { sequenceNumber: 2, candidateResponse: "not json" }] },
  } });

  await prisma.verificationRun.createMany({ data: [
    { taskId: numericTask.id, verifierVersionId: versionFor(numericTask.id).id, candidate: "1157.63", passed: true, details: { details: "Difference 0 is within tolerance 0.01.", executionTimeMs: 0.12 } },
    { taskId: exactTask.id, verifierVersionId: versionFor(exactTask.id).id, candidate: "Cluj", passed: false, details: { details: "Candidate does not match the expected answer.", executionTimeMs: 0.07 } },
  ] });

  await prisma.reviewComment.createMany({ data: [
    { taskId: numericTask.id, author: reviewer.name, body: "Verifier tolerance and expected value checked. Ready for the benchmark." },
    { taskId: exactTask.id, author: reviewer.name, body: "Rollout failures are useful negatives; wording is clear." },
  ] });

  const releaseItems = [numericTask].map((task) => ({
    taskId: task.id,
    title: task.title,
    prompt: task.prompt,
    verifierType: task.verifierType,
    verifierConfig: task.verifierConfig,
    difficulty: task.difficulty,
    tags: task.tags,
    project: { id: stem.id, name: stem.name, description: stem.description },
    split: "train",
  })) as Prisma.InputJsonArray;
  const dataset = await prisma.dataset.create({ data: {
    projectId: stem.id,
    name: "Validated STEM Core",
    description: "Approved and review-ready deterministic tasks used for release demonstrations.",
    items: { create: [{ taskId: numericTask.id, position: 1 }] },
    versions: { create: { version: 1, name: "Validated STEM Core", description: "Initial curated snapshot.", items: releaseItems } },
    releases: { create: { version: "1.0.0", notes: "Initial demo release.", seed: "demo-42", trainPercentage: 80, validationPercentage: 10, testPercentage: 10, totalCount: 1, trainCount: 1, validationCount: 0, testCount: 0, items: releaseItems } },
    qualityReport: { create: {
      taskCount: 1, overallScore: 88, completenessScore: 100, verifierValidityScore: 100, duplicateSafetyScore: 100, verificationEvidenceScore: 50,
      errorCount: 0, warningCount: 1, infoCount: 0,
      issues: [{ severity: "warning", code: "LIMITED_EVIDENCE", taskId: numericTask.id, message: "Add more independent verification evidence before a high-stakes release." }],
      distributions: { difficulty: { MEDIUM: 1 }, verifierType: { NUMERIC: 1 }, status: { APPROVED: 1 } },
    } },
  } });

  const generationJob = await prisma.generationJob.create({ data: {
    projectId: stem.id, status: "COMPLETED", requestedCount: 3, generatedCount: 3, seed: "demo-generation-42", generatorType: "ARITHMETIC", difficulty: "MEDIUM", progress: 100, completedAt: new Date("2026-07-20T08:30:00Z"),
  } });
  await prisma.asyncJob.createMany({ data: [
    { projectId: stem.id, initiatorId: admin.id, type: "BATCH_TASK_GENERATION", status: "COMPLETED", progress: 100, input: { seed: "demo-generation-42", count: 3 }, inputSummary: "Generate 3 arithmetic tasks", resultReference: { kind: "GENERATION_JOB", id: generationJob.id, href: `/dashboard/generation?job=${generationJob.id}` }, startedAt: new Date("2026-07-20T08:29:59Z"), completedAt: new Date("2026-07-20T08:30:00Z") },
    { projectId: stem.id, initiatorId: curator.id, type: "DATASET_QUALITY_SCAN", status: "COMPLETED", progress: 100, input: { datasetId: dataset.id }, inputSummary: "Quality scan for Validated STEM Core", resultReference: { kind: "DATASET_QUALITY", href: `/dashboard/datasets/${dataset.id}/quality` }, startedAt: new Date("2026-07-20T11:00:00Z"), completedAt: new Date("2026-07-20T11:00:01Z") },
  ] });
  await prisma.auditEvent.createMany({ data: [
    { projectId: stem.id, taskId: numericTask.id, action: "TASK_APPROVED", metadata: { source: "seed", reviewer: reviewer.name } },
    { projectId: stem.id, taskId: numericTask.id, action: "TASK_ADDED_TO_DATASET", metadata: { datasetId: dataset.id, datasetName: dataset.name } },
    { projectId: stem.id, action: "DATASET_RELEASE_CREATED", metadata: { datasetId: dataset.id, version: "1.0.0", source: "seed" } },
    { projectId: stem.id, action: "DATASET_QUALITY_SCANNED", metadata: { datasetId: dataset.id, score: 88, source: "seed" } },
  ] });

  await prisma.project.create({
    data: {
      name: "Instruction Following",
      description: "Draft workspace for constrained response-format tasks.",
      memberships: { create: [
        { userId: admin.id, role: "ADMIN" },
        { userId: author.id, role: "REVIEWER" },
        { userId: reviewer.id, role: "AUTHOR" },
        { userId: curator.id, role: "CURATOR" },
      ] },
      auditEvents: {
        create: { action: "PROJECT_CREATED", metadata: { source: "seed" } },
      },
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
