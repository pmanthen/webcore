# Autonomous UX Evaluation

Full-stack TypeScript SaaS for automated UX feedback. Clients onboard a web project URL; an AI agent browses the site and returns structured UX findings.

## Architecture (Phase 1 — local)

| Package | Role |
|---------|------|
| `apps/web` | Next.js (App Router) — UI, auth, onboarding, API, job enqueue |
| `apps/worker` | Node.js worker — BullMQ consumer, Playwright + Stagehand evaluation |
| `packages/database` | Shared Prisma schema, client, and domain TypeScript types |
| `infra/` | Terraform AWS foundation (VPC + ECS/Fargate placeholders) |
| PostgreSQL | Primary data store (Prisma) |
| Redis | BullMQ job queue |
| MinIO | S3-compatible object store for audit artifacts (screenshots) |

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

# 2. Start PostgreSQL, Redis and MinIO
npm run docker:up
# or: docker compose up -d

# 3. Verify services
docker compose ps
# postgres   → healthy on localhost:5432
# redis      → healthy on localhost:6379
# minio      → healthy on localhost:9000 (console on localhost:9001)
# minio-init → Exited (0) after creating the `ux-artifacts` bucket

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
| `MINIO_ENDPOINT` | MinIO host for worker uploads + web proxy | `localhost` |
| `MINIO_PORT` | MinIO S3 API port | `9000` |
| `MINIO_CONSOLE_PORT` | MinIO web console port | `9001` |
| `MINIO_USE_SSL` | `true` \| `false` | `false` |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | Compose MinIO credentials | `minioadmin` |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | App-side MinIO credentials | `minioadmin` |
| `MINIO_BUCKET` | Artifact bucket, created by `minio-init` | `ux-artifacts` |
| `MINIO_PUBLIC_URL` | Base URL for direct artifact links (debugging) | `http://localhost:9000` |

When `web` / `worker` later run as Compose services, use the internal hostnames `postgres`, `redis`, and `minio` on the `ux-eval-network` bridge network instead of `localhost`.

### Object storage

The `ux-artifacts` bucket stays **private**. The worker uploads screenshots and stores the
object key on the row; the web app streams them back through `GET /api/artifacts/<key>`,
so the browser never needs MinIO credentials or a public bucket policy. The MinIO console
(`http://localhost:9001`) is exposed for local inspection only.

## Shared database package

`@autonomous-ux/database` owns the Prisma schema and exports a singleton client plus typed domain helpers:

```ts
import {
  prisma,
  UX_EVALUATION_QUEUE_NAME,
  ISSUE_CATEGORIES,
  ISSUE_SEVERITIES,
  normalizeSeverity,
  summarizeSeverities,
  type IssueCategory,
  type IssueSeverity,
  type UxFinding,
  type UxEvaluationJobData,
  type ProjectStatus,
} from "@autonomous-ux/database";
```

| Model | Purpose |
|-------|---------|
| `Client` | Tenant / account |
| `Project` | Target URL + `ProjectStatus` |
| `EvaluationRun` | One audit pass: status, summary, score, run screenshot, raw agent payload |
| `EvaluationFeedback` | **One row per UX finding**: category, severity, description, recommendation, screenshot, element selector |

Findings use a fixed triage taxonomy stored as plain strings:

| Field | Values |
|-------|--------|
| `category` | `Accessibility`, `Cognitive Load`, `Friction` |
| `severity` | `Low`, `Medium`, `High` |

## Workspace scripts

| Script | Description |
|--------|-------------|
| `npm run docker:up` | Start Postgres + Redis + MinIO |
| `npm run docker:down` | Stop Compose stack |
| `npm run docker:logs` | Tail Compose logs |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:migrate` | Create/apply migrations (dev) |
| `npm run db:migrate:deploy` | Apply existing migrations |
| `npm run db:studio` | Open Prisma Studio |
| `npm run build:db` | Compile `@autonomous-ux/database` |
| `npm run dev:web` | Dev server for Next.js (`http://localhost:3000`) |
| `npm run dev:worker` | BullMQ worker (Stagehand UX evaluation) |
| `npm run typecheck` | `tsc` across every workspace, tests included |
| `npm run lint` | ESLint (`apps/web`) and `tsc` (`packages/*`, `apps/worker`) |
| `npm run test` | Vitest across all three workspaces |
| `npm run test:watch` | Vitest in watch mode |

## Testing

Vitest runs from the repo root as a single multi-project suite. Each workspace
owns a `vitest.config.mts` and the root config discovers them, so
`npm run test -w @autonomous-ux/worker` behaves exactly like that project does in
the full run.

```bash
npm run test                          # everything
npm run test -w @autonomous-ux/worker # one workspace
npm run test:watch                    # watch mode
```

No database, Redis, or MinIO is needed. `packages/database` is aliased to its
source rather than `dist/`, so a test run never waits on `build:db`, and the
Prisma client — constructed on import but not connected until a query runs —
gets a throwaway `DATABASE_URL` from the Vitest config.

| Suite | Covers |
|-------|--------|
| `packages/database/tests` | Severity and category coercion, the type guards, `summarizeSeverities`, `toTypedFeedback` |
| `apps/worker/tests` | The `100 / (1 + penalty / 45)` scoring curve and its boundaries, executive-summary composition, the heuristic Zod schemas, selector verification and the `observe()` fallback |
| `apps/web/tests` | Artifact key validation and proxy-path encoding, triage tone and score-gauge thresholds |

Selector verification is exercised against a real DOM (`happy-dom`) rather than a
stubbed lookup, so a hallucinated selector, an unparseable one, and a valid one
each take the path they would take in the browser.

Test files live in a `tests/` directory per workspace, outside the `src/**`
that the build compiles, and are typechecked by a sibling `tsconfig.test.json`.

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to
`master` and on every pull request: `npm ci` (whose `postinstall` generates the
Prisma client and builds the shared package), then `npm run typecheck`,
`npm run lint`, and `npm run test`. Runs are cancelled when a branch is pushed
again while one is still in flight.

## Web app (Step 3)

```bash
npm run docker:up
npm run db:migrate:deploy
npm run dev:web
```

Root `.env` is loaded automatically (optional overrides in `apps/web/.env.local`).

- Dashboard: `/dashboard` (sidebar + project list)
- Onboard: `/dashboard/onboard`
- Triage: `/projects/[projectId]/results` (add `?run=<id>` to view an earlier run)
- API: `POST /api/evaluate` — creates `Project` + `EvaluationRun`, enqueues BullMQ job on `ux-evaluation`
- API: `GET /api/artifacts/<key>` — streams a screenshot out of the private MinIO bucket

### Triage dashboard

The results page shows the aggregate score as a gauge, the executive summary, and a
severity breakdown, then a filterable grid of findings. Category and severity filters,
free-text search, the screenshot modal, and the selector inspector are all client-side
with `useState`/`useMemo` — no state library. Screenshots are rendered through the
`/api/artifacts` proxy, so the MinIO bucket stays private.

## Worker (Step 4)

```bash
npm run docker:up
npm run db:migrate:deploy
npm run dev:worker
```

Default `UX_EVALUATION_MODE=mock` completes jobs with sample findings (no browser). Set
`UX_EVALUATION_MODE=live` plus an LLM key to run the real audit: navigate, full-page
screenshot to MinIO, `observe()` the interactable elements, then one `extract()` per
heuristic pillar (Accessibility, Cognitive Load, Friction) against a strict Zod schema,
plus element crops for the findings that warrant evidence. See
[`apps/worker/README.md`](apps/worker/README.md) for the pipeline, scoring model, and the
`dev/` harness that runs the whole thing offline without an LLM account.

The job payload on `ux-evaluation` is `{ projectId, runId, url, clientId }`, and the BullMQ
job id equals `runId` so a run is always traceable back to its job.

## Implementation roadmap

1. **Step 1 (done):** Monorepo + Docker Compose (Postgres, Redis)
2. **Step 2 (done):** Prisma schema + shared types (`packages/database`)
3. **Step 3 (done):** Next.js dashboard, onboard form, `/api/evaluate`
4. **Step 4 (done):** BullMQ worker + Stagehand UX evaluation skeleton
5. **Step 5 (done):** Terraform AWS foundation (`infra/`)
6. **Step 6 (done):** Core intelligence engine — MinIO artifacts, per-finding schema,
   Stagehand `observe()` / `extract()` heuristic pipeline, triage dashboard
7. **Step 7 (done):** Vitest across the monorepo and a GitHub Actions CI pipeline
8. **Step 8 (next):** Auth.js sessions and per-tenant query scoping, replacing the
   `DEMO_CLIENT_EMAIL` bypass

## AWS / Terraform (Step 5)

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
```

See [`infra/README.md`](infra/README.md) for module layout and Phase 2 follow-ons (ECR, ALB, RDS, ElastiCache).

## License

Private — all rights reserved.
