import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.project.deleteMany();

  await prisma.project.create({
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
