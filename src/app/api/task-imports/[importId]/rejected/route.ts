import Papa from "papaparse";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ importId: string }> }) {
  if (!await getCurrentUser()) return Response.json({ error: "Authentication required." }, { status: 401 });
  const { importId } = await params;
  const record = await prisma.taskImport.findUnique({ where: { id: importId }, select: { id: true, rejectedRows: true } });
  if (!record) return Response.json({ error: "Import not found." }, { status: 404 });
  const rows = rejectedRows(record.rejectedRows);
  const body = Papa.unparse(rows.map((row) => ({ rowNumber: row.rowNumber, errors: row.errors.join("; "), raw: row.raw })), { newline: "\n" });
  return new Response(body + (body ? "\n" : ""), { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="verifilab-import-' + record.id + '-rejected.csv"',
  } });
}

function rejectedRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  const result: { rowNumber: number; errors: string[]; raw: string }[] = [];
  for (const row of value) {
    if (row === null || typeof row !== "object" || !("rowNumber" in row) || typeof row.rowNumber !== "number" || !("errors" in row) || !Array.isArray(row.errors) || !("raw" in row) || typeof row.raw !== "string") continue;
    const errors = row.errors.filter((error: unknown): error is string => typeof error === "string");
    if (errors.length === row.errors.length) result.push({ rowNumber: row.rowNumber, errors, raw: row.raw });
  }
  return result;
}
