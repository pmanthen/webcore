# `@autonomous-ux/database`

Shared Prisma schema, Prisma Client singleton, and domain TypeScript types used by both `apps/web` and `apps/worker`.

## Models

| Model | Purpose |
|-------|---------|
| `Client` | Tenant / account owning projects |
| `Project` | Target URL + evaluation status |
| `EvaluationFeedback` | UX issues and score from the AI worker |

## Usage

```ts
import {
  prisma,
  UX_EVALUATION_QUEUE_NAME,
  parseUxIssues,
  type UxIssue,
  type UxEvaluationJobData,
} from "@autonomous-ux/database";
```

## Commands

From the repo root (requires `DATABASE_URL` and a running Postgres):

```bash
npm run db:generate   # prisma generate
npm run db:migrate    # prisma migrate dev
npm run db:studio     # Prisma Studio
```
