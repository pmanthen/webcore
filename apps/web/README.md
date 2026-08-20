# `@autonomous-ux/web`

Next.js App Router application — dashboard UI and core API for Autonomous UX Evaluation.

## Local development

From the repo root (Postgres + Redis must be running):

```bash
npm run docker:up
npm run db:migrate:deploy
npm run dev:web
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard).

## Key routes

| Route | Purpose |
|-------|---------|
| `/dashboard` | Project list (sidebar layout) |
| `/dashboard/onboard` | Onboard project form (URL) |
| `POST /api/evaluate` | Persist project + enqueue BullMQ job |
| `GET /api/projects` | JSON list of projects |
