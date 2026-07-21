import { expect, test } from "@playwright/test";

test("task to rollout evaluation to reviewed JSONL release", async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = Date.now();
  const task = `Demo exact-match task ${suffix}`;
  const dataset = `Demo approved dataset ${suffix}`;

  await page.goto("/login");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("playwright-demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator("a.group").filter({ hasText: "STEM Reasoning Benchmark" }).click();

  await page.getByRole("link", { name: "New task" }).click();
  await page.locator('input[name="title"]').fill(task);
  await page.locator('textarea[name="prompt"]').fill("Return only the word ready.");
  await page.locator('input[name="tags"]').fill("demo, happy-path");
  await page.locator('input[name="expectedText"]').fill("ready");
  await page.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByRole("heading", { name: task })).toBeVisible();

  await page.getByRole("link", { name: "Evaluate rollouts" }).click();
  await page.getByPlaceholder("Model calibration run").fill(`Happy path rollout ${suffix}`);
  await page.locator("textarea").last().fill("ready");
  await page.getByRole("button", { name: "Create evaluation batch" }).click();
  await page.getByRole("button", { name: "Run evaluation" }).click();
  await page.waitForTimeout(1_000);
  await page.reload();
  await expect(page.getByText("COMPLETED", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("100.0%", { exact: true }).first()).toBeVisible();

  await page.getByRole("link", { name: task }).click();
  await page.getByRole("button", { name: "Start work" }).click();
  await page.waitForTimeout(1_000);
  await page.reload();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await page.waitForTimeout(1_000);
  await page.reload();
  await page.getByRole("button", { name: "Approve" }).click();
  await page.waitForTimeout(1_000);
  await page.reload();
  await expect(page.getByText("APPROVED", { exact: true })).toBeVisible();

  await page.goto("/dashboard/datasets/new");
  await page.locator('select[name="projectId"]').selectOption({ label: "STEM Reasoning Benchmark" });
  await page.locator('input[name="name"]').fill(dataset);
  await page.locator('textarea[name="description"]').fill("End-to-end demo dataset.");
  await page.getByRole("button", { name: "Create dataset" }).click();
  const taskOption = page.getByText(task).locator("..");
  await taskOption.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Add selected (1)" }).click();
  await page.waitForTimeout(1_000);
  await page.reload();
  await expect(page.getByRole("link", { name: task })).toBeVisible();

  await page.getByRole("link", { name: "Create release" }).click();
  await page.getByRole("button", { name: "Create immutable release" }).click();
  const result = page.getByRole("link", { name: "Open result" });
  await expect(result).toBeVisible({ timeout: 30_000 });
  await result.click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Full release" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.jsonl$/);
});
