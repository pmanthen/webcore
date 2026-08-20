# Autonomous UX Evaluation

Full-stack TypeScript SaaS for automated UX feedback. Clients onboard a web project URL; an AI agent browses the site and returns structured UX findings.

## Architecture (Phase 1 — local)

| Package | Role |
|---------|------|
| `apps/web` | Next.js (App Router) — UI, auth, onboarding, API, job enqueue |
| `apps/worker` | Node.js worker — BullMQ consumer, Playwright + Stagehand evaluation |
| `packages/database` | Shared Prisma schema, client, and domain TypeScript types |
| PostgreSQL | Primary data store (Prisma) |
| Redis | BullMQ job queue |

Phase 2 will add AWS deployment via Terraform under `infra/` (ECS/Fargate).

## Prerequisites

- Node.js 20+
- npm 10+ (workspaces)
- Docker & Docker Compose

## Quick start (local infrastructure)

```bash
# 1. Clone and install workspace dependencies
cp .env.example .env
npm install

# 2. Start PostgreSQL and Redis
npm run docker:up
# or: docker compose up -d

# 3. Verify services
docker compose ps
# postgres → healthy on localhost:5432
# redis    → healthy on localhost:6379

# 4. Apply database migrations (Prisma)
npm run db:migrate:deploy
```

Stop infrastructure:

```bash
npm run docker:down
# or: docker compose down
```

Follow logs:

```bash
npm run docker:logs
```

## Environment variables

Copy `.env.example` to `.env` at the **repo root**. That single file is loaded by:

- Prisma (`npm run db:*` via `dotenv-cli`)
- Next.js (`npm run dev:web` — root `.env`, optionally overridden by `apps/web/.env.local`)
- Worker (`npm run dev:worker` — `--env-file=../../.env`)

| Variable | Purpose | Local default |
|----------|---------|---------------|
| `DATABASE_URL` | Prisma → PostgreSQL | `postgresql://uxeval:uxeval@localhost:5432/uxeval?schema=public` |
| `REDIS_URL` | BullMQ → Redis | `redis://localhost:6379` |
| `POSTGRES_*` | Compose Postgres credentials/ports | see `.env.example` |
| `UX_EVALUATION_MODE` | Worker `mock` \| `live` | `mock` |

When `web` / `worker` later run as Compose services, use the internal hostnames `postgres` and `redis` on the `ux-eval-network` bridge network instead of `localhost`.

## Shared database package

`@autonomous-ux/database` owns the Prisma schema and exports a singleton client plus typed domain helpers:

```ts
import {
  prisma,
  UX_EVALUATION_QUEUE_NAME,
  parseUxIssues,
  type UxIssue,
  type UxEvaluationJobData,
  type ProjectStatus,
} from "@autonomous-ux/database";
```

| Model | Purpose |
|-------|---------|
| `Client` | Tenant / account |
| `Project` | Target URL + `ProjectStatus` |
| `EvaluationFeedback` | UX issues (`UxIssue[]` JSON), score, optional raw agent payload |

## Workspace scripts

| Script | Description |
|--------|-------------|
| `npm run docker:up` | Start Postgres + Redis |
| `npm run docker:down` | Stop Compose stack |
| `npm run docker:logs` | Tail Compose logs |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:migrate` | Create/apply migrations (dev) |
| `npm run db:migrate:deploy` | Apply existing migrations |
| `npm run db:studio` | Open Prisma Studio |
| `npm run build:db` | Compile `@autonomous-ux/database` |
| `npm run dev:web` | Dev server for Next.js (`http://localhost:3000`) |
| `npm run dev:worker` | BullMQ worker (Stagehand UX evaluation) |

## Web app (Step 3)

```bash
npm run docker:up
npm run db:migrate:deploy
npm run dev:web
```

Root `.env` is loaded automatically (optional overrides in `apps/web/.env.local`).

- Dashboard: `/dashboard` (sidebar + project list)
- Onboard: `/dashboard/onboard`
- API: `POST /api/evaluate` — creates `Project` + `EvaluationFeedback`, enqueues BullMQ job on `ux-evaluation`

## Worker (Step 4)

```bash
npm run docker:up
npm run db:migrate:deploy
npm run dev:worker
```

Default `UX_EVALUATION_MODE=mock` completes jobs with sample `UxIssue[]` (no browser). Set `UX_EVALUATION_MODE=live` plus LLM / Browserbase keys to exercise Stagehand `observe()` / `act()`.

## Implementation roadmap

1. **Step 1 (done):** Monorepo + Docker Compose (Postgres, Redis)
2. **Step 2 (done):** Prisma schema + shared types (`packages/database`)
3. **Step 3 (done):** Next.js dashboard, onboard form, `/api/evaluate`
4. **Step 4 (done):** BullMQ worker + Stagehand UX evaluation skeleton
5. **Step 5:** Terraform AWS foundation (`infra/`)

## License

Private — all rights reserved.
