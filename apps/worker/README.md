# `@autonomous-ux/worker`

BullMQ worker that runs autonomous UX evaluations with Stagehand + Playwright and writes results to PostgreSQL via Prisma.

## Run locally

```bash
# From repo root — Postgres + Redis must be up
npm run docker:up
npm run db:migrate:deploy
npm run dev:worker
```

Default mode is **mock** (`UX_EVALUATION_MODE=mock`): jobs complete with sample UX issues without launching a browser.

## Live Stagehand mode

```bash
# in .env
UX_EVALUATION_MODE=live
STAGEHAND_ENV=LOCAL          # or BROWSERBASE
OPENAI_API_KEY=...
# If BROWSERBASE:
# BROWSERBASE_API_KEY=...
# BROWSERBASE_PROJECT_ID=...
```

## Job contract

Queue: `ux-evaluation`  
Payload (`UxEvaluationJobData`):

```ts
{ projectId, evaluationId, url, clientId }
```

On success the worker sets `Project.status = COMPLETED` and updates `EvaluationFeedback` with summary, score, and `UxIssue[]`.
