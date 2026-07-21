export function GET() {
  return Response.json({ name: "VerifiLab", version: "1.0.0", runtime: "Next.js monolith", database: "SQLite via Prisma" });
}
