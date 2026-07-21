import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

describe("proxy", () => {
  it("leaves bearer API authentication to the v1 route", () => {
    const response = proxy(new NextRequest("http://localhost/api/v1/tasks"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps session-protected API routes private", async () => {
    const response = proxy(new NextRequest("http://localhost/api/task-imports"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Authentication required." });
  });
});
