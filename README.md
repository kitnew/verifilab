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

## Evaluation execution architecture

The local prototype evaluates bounded batches in-process and persists progress after each 25-result chunk. Batch and result status guards make retries idempotent and allow cancellation between chunks.

Production replacement: `API → durable queue → verification workers → database/object storage`. Route and UI contracts can remain while workers claim queued batches from durable infrastructure. This prototype intentionally does not add Redis, queues, object storage, or external model inference.
