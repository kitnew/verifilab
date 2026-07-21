# Architecture

VerifiLab is one Next.js 16 App Router application. React server/client components provide the UI; server actions implement mutations; route handlers provide imports, exports, API v1, health, and metadata. Shared domain logic lives in `src/lib` and Prisma is the only persistence adapter.

SQLite remains the database. Prisma migrations under `prisma/migrations` are the schema history and `prisma/seed.ts` builds the disposable demo workspace. Long-running product operations use database-backed job records but execute inside the application process.

The Docker image builds Next.js standalone output, runs migrations before the server, uses a non-root user, stores SQLite under `/data`, and exposes a database-aware health check.
