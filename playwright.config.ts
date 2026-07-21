import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run db:deploy && npm run db:seed && npm run build && cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public && PORT=3100 node .next/standalone/server.js",
    url: "http://127.0.0.1:3100/api/health",
    timeout: 180_000,
    reuseExistingServer: false,
    env: { ...process.env, DATABASE_URL: `file:${process.cwd()}/prisma/playwright.db`, BOOTSTRAP_ADMIN_PASSWORD: "playwright-demo", NEXT_TURBOPACK_ROOT: process.cwd(), HOSTNAME: "127.0.0.1" },
  },
});
