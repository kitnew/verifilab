# Testing

`npm run quality` is the required local/CI gate. It runs ESLint, TypeScript, Vitest tests, and a production Next.js build in that order.

The Playwright scenario uses `prisma/playwright.db`, deploys migrations, reseeds demo data, builds the production app, and starts it on port 3100:

```bash
npx playwright install chromium
npm run test:e2e
```

The scenario signs in as the bootstrap admin and exercises task creation, rollout evaluation, review approval, dataset curation, release creation, and JSONL download. Unit tests cover the public health/meta behavior and proxy exemptions.
