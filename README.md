# Autonomous UX Evaluation

Full-stack TypeScript SaaS for automated UX feedback. Clients onboard a web project URL; an AI agent browses the site and returns structured UX findings.

## Architecture (Phase 1 — local)

| Package | Role |
|---------|------|
| `apps/web` | Next.js (App Router) — UI, auth, onboarding, API, job enqueue |
| `apps/worker` | Node.js worker — BullMQ consumer, Playwright + Stagehand evaluation |
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

Copy `.env.example` to `.env`. Key variables:

| Variable | Purpose | Local default |
|----------|---------|---------------|
| `DATABASE_URL` | Prisma → PostgreSQL | `postgresql://uxeval:uxeval@localhost:5432/uxeval?schema=public` |
| `REDIS_URL` | BullMQ → Redis | `redis://localhost:6379` |
| `POSTGRES_*` | Compose Postgres credentials/ports | see `.env.example` |

When `web` / `worker` later run as Compose services, use the internal hostnames `postgres` and `redis` on the `ux-eval-network` bridge network instead of `localhost`.

## Workspace scripts

| Script | Description |
|--------|-------------|
| `npm run docker:up` | Start Postgres + Redis |
| `npm run docker:down` | Stop Compose stack |
| `npm run docker:logs` | Tail Compose logs |
| `npm run dev:web` | Dev server for Next.js (after Step 3) |
| `npm run dev:worker` | Dev process for the worker (after Step 4) |

## Implementation roadmap

1. **Step 1 (done):** Monorepo + Docker Compose (Postgres, Redis)
2. **Step 2:** Prisma schema + shared types
3. **Step 3:** Next.js dashboard, onboard form, `/api/evaluate`
4. **Step 4:** BullMQ worker + Stagehand UX evaluation skeleton
5. **Step 5:** Terraform AWS foundation (`infra/`)

## License

Private — all rights reserved.
