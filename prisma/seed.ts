import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.project.deleteMany();

  const stem = await prisma.project.create({
    data: {
      name: "STEM Reasoning Benchmark",
      description: "A curated set of deterministic math and science tasks for evaluator calibration.",
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

  await prisma.project.create({
    data: {
      name: "Instruction Following",
      description: "Draft workspace for constrained response-format tasks.",
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
