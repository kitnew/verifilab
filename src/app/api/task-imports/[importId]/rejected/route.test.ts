import Papa from "papaparse";
import { expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn().mockResolvedValue({ id: "user" }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { taskImport: { findUnique } } }));

import { GET } from "./route";

it("downloads rejected rows as escaped UTF-8 CSV", async () => {
  findUnique.mockResolvedValue({
    id: "import-1",
    rejectedRows: [{ rowNumber: 3, errors: ["Invalid, quoted \"value\""], raw: "Привет,\nмир" }],
  });
  const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ importId: "import-1" }) });
  expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="verifilab-import-import-1-rejected.csv"');
  expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
  const parsed = Papa.parse<Record<string, string>>(await response.text(), { header: true });
  expect(parsed.data[0]).toEqual({ rowNumber: "3", errors: 'Invalid, quoted "value"', raw: "Привет,\nмир" });
});
