# VerifiLab

Local prototype for authoring and reviewing deterministic RLVR-style tasks.

## Run locally

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The first slice supports project creation and task creation, viewing, editing, and deletion. Datasets, verification runs, and review comments are modeled but do not have UI workflows yet.
