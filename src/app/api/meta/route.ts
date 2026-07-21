export function GET() {
  return Response.json({ name: "VerifiLab", version: "0.1.0", runtime: "Next.js monolith", database: "SQLite via Prisma" });
}
