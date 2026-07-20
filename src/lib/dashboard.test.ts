import { describe, expect, it } from "vitest";
import { percentage } from "@/lib/dashboard";

describe("dashboard percentages", () => {
  it("rounds rates and handles empty denominators", () => {
    expect(percentage(2, 3)).toBe(67);
    expect(percentage(0, 0)).toBe(0);
  });
});
