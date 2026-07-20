import { z } from "zod";

export const generatorTypes = ["ARITHMETIC", "LINEAR_EQUATIONS", "STRING_TRANSFORMATIONS", "JSON_STRUCTURE", "REGEX_FORMAT"] as const;
export const difficulties = ["EASY", "MEDIUM", "HARD"] as const;
export const GENERATOR_VERSION = 1;
export const MAX_BATCH_SIZE = 100;

export const generationRequestSchema = z.object({
  projectId: z.string().min(1, "Select a project."),
  generatorType: z.enum(generatorTypes),
  count: z.coerce.number().int().min(1).max(MAX_BATCH_SIZE, `Maximum batch size is ${MAX_BATCH_SIZE}.`),
  difficulty: z.enum(difficulties),
  seed: z.string().trim().min(1, "Enter a seed.").max(100),
});

export const selectedGenerationSchema = z.object({
  jobId: z.string().min(1),
  indices: z.array(z.number().int().min(0)).min(1, "Select at least one task.").max(MAX_BATCH_SIZE).transform((values) => [...new Set(values)]),
});

export type GeneratorType = (typeof generatorTypes)[number];
export type Difficulty = (typeof difficulties)[number];
export type GenerationRequest = z.infer<typeof generationRequestSchema>;

export type GeneratedTask = {
  index: number;
  title: string;
  prompt: string;
  verifierType: "EXACT_MATCH" | "NUMERIC" | "REGEX" | "JSON_SCHEMA";
  verifierConfig: Record<string, unknown>;
  expectedAnswer: string;
  difficulty: Difficulty;
  tags: string[];
  generatorTemplate: GeneratorType;
  generatorVersion: number;
  seed: string;
  generationBatchId: string;
};

export function generateTasks(input: GenerationRequest, generationBatchId: string): GeneratedTask[] {
  const parsed = generationRequestSchema.parse(input);
  const random = seededRandom(`${parsed.seed}:${parsed.generatorType}:v${GENERATOR_VERSION}`);
  return Array.from({ length: parsed.count }, (_, index) => generateOne(parsed, generationBatchId, index, random));
}

export function generationFingerprint(task: Pick<GeneratedTask, "title" | "prompt" | "verifierType" | "verifierConfig">) {
  return JSON.stringify([task.title, task.prompt, task.verifierType, task.verifierConfig]);
}

function generateOne(input: GenerationRequest, batchId: string, index: number, random: () => number): GeneratedTask {
  const metadata = {
    index,
    difficulty: input.difficulty,
    generatorTemplate: input.generatorType,
    generatorVersion: GENERATOR_VERSION,
    seed: input.seed,
    generationBatchId: batchId,
  };
  const scale = input.difficulty === "EASY" ? 10 : input.difficulty === "MEDIUM" ? 50 : 250;

  if (input.generatorType === "ARITHMETIC") {
    const operations = ["+", "-", "×"] as const;
    const operation = operations[pick(random, operations.length)];
    const left = integer(random, 1, scale);
    const right = integer(random, 1, scale);
    const expected = operation === "+" ? left + right : operation === "-" ? left - right : left * right;
    return { ...metadata, title: `Arithmetic ${index + 1}: ${left} ${operation} ${right}`, prompt: `Calculate ${left} ${operation} ${right}. Return only the number.`, verifierType: "NUMERIC", verifierConfig: { expected, tolerance: 0 }, expectedAnswer: String(expected), tags: ["generated", "arithmetic"] };
  }

  if (input.generatorType === "LINEAR_EQUATIONS") {
    const solution = integer(random, -scale, scale);
    const coefficient = integer(random, 1, Math.max(3, Math.floor(scale / 2)));
    const offset = integer(random, -scale, scale);
    const total = coefficient * solution + offset;
    return { ...metadata, title: `Linear equation ${index + 1}`, prompt: `Solve for x: ${coefficient}x ${signed(offset)} = ${total}. Return only x.`, verifierType: "NUMERIC", verifierConfig: { expected: solution, tolerance: 0 }, expectedAnswer: String(solution), tags: ["generated", "algebra"] };
  }

  if (input.generatorType === "STRING_TRANSFORMATIONS") {
    const words = ["laboratory", "verification", "dataset", "reward", "deterministic", "benchmark"];
    const source = `${words[pick(random, words.length)]}-${integer(random, 10, 99)}`;
    const modes = ["reverse", "uppercase", "remove hyphen"] as const;
    const mode = modes[pick(random, modes.length)];
    const expected = mode === "reverse" ? [...source].reverse().join("") : mode === "uppercase" ? source.toUpperCase() : source.replace("-", "");
    return { ...metadata, title: `String transformation ${index + 1}`, prompt: `${mode[0].toUpperCase()}${mode.slice(1)} the string "${source}". Return only the transformed string.`, verifierType: "EXACT_MATCH", verifierConfig: { expected, caseSensitive: true, trimWhitespace: true }, expectedAnswer: expected, tags: ["generated", "strings"] };
  }

  if (input.generatorType === "JSON_STRUCTURE") {
    const field = ["answer", "score", "result", "value"][pick(random, 4)];
    const value = integer(random, 0, scale);
    const schema = { type: "object", required: [field], properties: { [field]: { type: "integer" } }, additionalProperties: false };
    const expected = JSON.stringify({ [field]: value });
    return { ...metadata, title: `JSON structure ${index + 1}`, prompt: `Return a JSON object with exactly one integer field named "${field}". A valid example value is ${value}.`, verifierType: "JSON_SCHEMA", verifierConfig: { schema }, expectedAnswer: expected, tags: ["generated", "json"] };
  }

  const formats = [
    { name: "ticket", prompt: "ABC-1234", pattern: "^[A-Z]{3}-\\d{4}$" },
    { name: "hex color", prompt: "#A1B2C3", pattern: "^#[0-9A-F]{6}$" },
    { name: "version", prompt: "v12.34.56", pattern: "^v\\d+\\.\\d+\\.\\d+$" },
  ];
  const format = formats[pick(random, formats.length)];
  return { ...metadata, title: `Regex format ${index + 1}: ${format.name}`, prompt: `Return a value matching the ${format.name} format, for example ${format.prompt}.`, verifierType: "REGEX", verifierConfig: { pattern: format.pattern, flags: "" }, expectedAnswer: format.prompt, tags: ["generated", "regex"] };
}

function seededRandom(seed: string) {
  let state = 2166136261;
  for (const character of seed) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function integer(random: () => number, min: number, max: number) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pick(random: () => number, length: number) {
  return Math.floor(random() * length);
}

function signed(value: number) {
  return value < 0 ? `- ${Math.abs(value)}` : `+ ${value}`;
}
