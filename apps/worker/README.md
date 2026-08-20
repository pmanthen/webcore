# `@autonomous-ux/worker`

BullMQ worker that audits a URL with Stagehand, stores screenshots in MinIO, and writes structured findings to PostgreSQL via Prisma.

## Run locally

```bash
# From repo root — Postgres, Redis, and MinIO must be up
npm run docker:up
npm run db:migrate:deploy
npm run dev:worker
```

Default mode is **mock** (`UX_EVALUATION_MODE=mock`): jobs complete with sample findings without launching a browser or calling an LLM.

## The audit pipeline

In `live` mode, `runUxEvaluation()` performs:

1. **Stealth launch** — Chromium args + UA/`Accept-Language` headers + webdriver mask (or Browserbase `advancedStealth` when `STAGEHAND_ENV=BROWSERBASE`).
2. **Navigate** to the target URL at the configured viewport (default 1920×1080).
3. **Pre-flight cleanup** (deterministic, before any AI call):
   - soft `networkidle` wait (default 15s, never fails the run)
   - incremental scroll to mount lazy content, then scroll back to top
   - fast CSS-selector cookie/popup clicks (500ms budget each)
   - scoped Stagehand `act()` only if a large overlay still covers the viewport
4. **Full-page screenshot** → uploaded to MinIO as `runs/<runId>/full-page.png`, recorded on `EvaluationRun.screenshotKey`.
5. **`observe()`** the interactable elements. These are real, resolvable selectors, and they double as the fallback when a model-proposed selector turns out not to exist.
6. **`extract()` once per heuristic pillar**, each against a strict Zod schema:
   | Pillar | Looks for |
   |--------|-----------|
   | Accessibility | missing alt text and labels, low contrast, divs acting as buttons, heading order |
   | Cognitive Load | cluttered navigation, competing primary CTAs, vague copy, undifferentiated text walls |
   | Friction | dead ends, unvalidated form fields, over-long forms, layout shift, hidden costs |
7. **Resolve selectors.** A selector the model proposes is only trusted after it verifies against the live DOM; otherwise the model's element description is matched against the `observe()` results.
8. **Element crops.** High and medium findings with a resolved selector get a padded crop uploaded to MinIO, capped by `UX_MAX_ELEMENT_SCREENSHOTS`.
9. **Score and summarize**, then persist everything in one Prisma transaction.

A failed pillar or crop is logged and skipped — a partial audit beats none. Navigation and browser failures propagate so the run is marked `FAILED` with the error recorded on `EvaluationRun.error`.

### Scoring

Severity penalties (High 10, Medium 4, Low 1) are mapped through `100 / (1 + penalty / 45)` rather than subtracted, so the score has diminishing returns instead of flooring at 0 and erasing the difference between a bad page and a catastrophic one.

## Live mode configuration

```bash
# in .env
UX_EVALUATION_MODE=live
STAGEHAND_ENV=LOCAL              # or BROWSERBASE
STAGEHAND_MODEL=openai/gpt-4.1-mini
OPENAI_API_KEY=...

# Optional — OpenAI-compatible gateway instead of api.openai.com
# STAGEHAND_MODEL_API_KEY=...
# STAGEHAND_BASE_URL=https://my-gateway.example.com/v1
# STAGEHAND_OPENAI_ENDPOINT_FORMAT=chat   # for gateways exposing only /chat/completions

# If BROWSERBASE:
# BROWSERBASE_API_KEY=...
# BROWSERBASE_PROJECT_ID=...
```

Audit tuning: `UX_VIEWPORT_WIDTH`, `UX_VIEWPORT_HEIGHT`, `UX_NAV_TIMEOUT_MS`, `UX_EXTRACT_TIMEOUT_MS`, `UX_MAX_ELEMENT_SCREENSHOTS`.

Stealth / pre-flight: `UX_USER_AGENT`, `UX_ACCEPT_LANGUAGE`, `STAGEHAND_CACHE_DIR`, `UX_NETWORK_IDLE_TIMEOUT_MS`, `UX_PREFLIGHT_CLICK_TIMEOUT_MS`, `UX_PREFLIGHT_SCROLL_PAUSE_MS`, `UX_PREFLIGHT_MAX_SCROLL_MS`, `UX_PREFLIGHT_AI_FALLBACK`, `UX_PREFLIGHT_AI_TIMEOUT_MS`.

## Local live runs without an LLM account (`dev/`)

`dev/` holds a harness for exercising the whole pipeline offline:

```bash
node apps/worker/dev/fixture-site.mjs 4599     # deliberately flawed landing page
node apps/worker/dev/mock-llm-server.mjs 4600  # OpenAI-compatible endpoint
```

Then point the worker at it and audit the fixture:

```bash
# in .env
UX_EVALUATION_MODE=live
STAGEHAND_MODEL_API_KEY=mock-key
STAGEHAND_BASE_URL=http://localhost:4600/v1
STAGEHAND_OPENAI_ENDPOINT_FORMAT=chat
```

```bash
curl -X POST http://localhost:3000/api/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"url":"http://localhost:4599/","name":"Nimbus Analytics"}'
```

The mock stands in for the model's **judgement only**. Stagehand still converts the Zod schemas to JSON Schema, makes the HTTP call, and validates the response; the worker still verifies selectors against the live DOM, measures element geometry, crops, and uploads. One fixture finding deliberately proposes a selector that does not exist, so every run also covers the `observe()` fallback path.

## Job contract

Queue: `ux-evaluation`
Payload (`UxEvaluationJobData`):

```ts
{ projectId, runId, url, clientId }
```

The BullMQ job id equals `runId`. On success the worker sets `Project.status = COMPLETED`, replaces the run's `EvaluationFeedback` rows, and completes the `EvaluationRun` with a score and executive summary. Retries replace the previous attempt's findings rather than accumulating duplicates.

## A note on `page.evaluate`

Callbacks passed to `page.evaluate` must stay **flat** — no nested or named functions. Stagehand ships them to the browser via `Function.toString()`, and esbuild (which `tsx` uses in dev) rewrites nested functions to `__name(fn, "fn")` for stack traces. That helper only exists in the bundle, so the stringified source throws `__name is not defined` inside the page. See the comment in `src/services/screenshots.ts`.
