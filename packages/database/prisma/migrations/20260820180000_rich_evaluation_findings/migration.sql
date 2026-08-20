-- Splits the run-level `evaluation_feedback` record into:
--   * `evaluation_runs`        — one row per audit pass (summary, score, raw agent payload)
--   * `evaluation_feedback`    — one row per actionable UX finding (triage dashboard unit)
--
-- Legacy data is preserved: each old feedback row becomes a run, and every entry of
-- its `issues` JSON array is expanded into a finding row on the new taxonomy.

-- CreateEnum
CREATE TYPE "EvaluationRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "evaluation_runs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "status" "EvaluationRunStatus" NOT NULL DEFAULT 'QUEUED',
    "summary" TEXT,
    "score" DOUBLE PRECISION,
    "screenshot_key" TEXT,
    "screenshot_url" TEXT,
    "raw_response" JSONB,
    "job_id" TEXT,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evaluation_runs_project_id_idx" ON "evaluation_runs"("project_id");

-- CreateIndex
CREATE INDEX "evaluation_runs_job_id_idx" ON "evaluation_runs"("job_id");

-- CreateIndex
CREATE INDEX "evaluation_runs_status_idx" ON "evaluation_runs"("status");

-- AddForeignKey
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every legacy `evaluation_feedback` row described a whole run.
-- Ids are carried over so existing BullMQ job ids keep resolving.
INSERT INTO "evaluation_runs" (
    "id", "project_id", "status", "summary", "score", "raw_response",
    "job_id", "started_at", "finished_at", "created_at", "updated_at"
)
SELECT
    f."id",
    f."project_id",
    CASE p."status"
        WHEN 'COMPLETED' THEN 'COMPLETED'::"EvaluationRunStatus"
        WHEN 'FAILED'    THEN 'FAILED'::"EvaluationRunStatus"
        WHEN 'RUNNING'   THEN 'RUNNING'::"EvaluationRunStatus"
        ELSE 'QUEUED'::"EvaluationRunStatus"
    END,
    f."summary",
    f."score",
    f."raw_response",
    f."job_id",
    CASE WHEN p."status" IN ('RUNNING', 'COMPLETED', 'FAILED') THEN f."created_at" END,
    CASE WHEN p."status" IN ('COMPLETED', 'FAILED') THEN f."updated_at" END,
    f."created_at",
    f."updated_at"
FROM "evaluation_feedback" f
JOIN "projects" p ON p."id" = f."project_id";

-- Stash the legacy issue arrays so they survive the `issues` column drop below.
CREATE TEMPORARY TABLE "_legacy_ux_issues" AS
SELECT
    f."id" AS run_id,
    f."project_id" AS project_id,
    entry.value AS issue,
    entry.ordinality AS position,
    f."created_at" AS created_at,
    f."updated_at" AS updated_at
FROM "evaluation_feedback" f
CROSS JOIN LATERAL jsonb_array_elements(f."issues") WITH ORDINALITY AS entry(value, ordinality)
WHERE jsonb_typeof(f."issues") = 'array'
  AND jsonb_typeof(entry.value) = 'object';

-- Old rows are runs now, not findings.
DELETE FROM "evaluation_feedback";

-- DropIndex
DROP INDEX "evaluation_feedback_job_id_idx";

-- AlterTable
ALTER TABLE "evaluation_feedback" DROP COLUMN "issues",
DROP COLUMN "job_id",
DROP COLUMN "raw_response",
DROP COLUMN "score",
DROP COLUMN "summary",
ADD COLUMN     "run_id" TEXT,
ADD COLUMN     "category" TEXT NOT NULL,
ADD COLUMN     "severity" TEXT NOT NULL,
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "recommendation" TEXT NOT NULL,
ADD COLUMN     "screenshot_url" TEXT,
ADD COLUMN     "screenshot_key" TEXT,
ADD COLUMN     "element_selector" TEXT,
ADD COLUMN     "page_url" TEXT;

-- CreateIndex
CREATE INDEX "evaluation_feedback_run_id_idx" ON "evaluation_feedback"("run_id");

-- CreateIndex
CREATE INDEX "evaluation_feedback_project_id_category_idx" ON "evaluation_feedback"("project_id", "category");

-- CreateIndex
CREATE INDEX "evaluation_feedback_project_id_severity_idx" ON "evaluation_feedback"("project_id", "severity");

-- AddForeignKey
ALTER TABLE "evaluation_feedback" ADD CONSTRAINT "evaluation_feedback_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "evaluation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Re-insert legacy issues as findings. The old 9-category / 4-severity taxonomy is
-- folded onto the new 3-category / 3-severity one.
INSERT INTO "evaluation_feedback" (
    "id", "project_id", "run_id", "category", "severity", "title", "description",
    "recommendation", "element_selector", "page_url", "created_at", "updated_at"
)
SELECT
    l.run_id || '-legacy-' || l.position,
    l.project_id,
    l.run_id,
    CASE lower(coalesce(l.issue->>'category', ''))
        WHEN 'accessibility' THEN 'Accessibility'
        WHEN 'navigation'    THEN 'Cognitive Load'
        WHEN 'content'       THEN 'Cognitive Load'
        WHEN 'visual_design' THEN 'Cognitive Load'
        ELSE 'Friction'
    END,
    CASE lower(coalesce(l.issue->>'severity', ''))
        WHEN 'critical' THEN 'High'
        WHEN 'major'    THEN 'Medium'
        ELSE 'Low'
    END,
    coalesce(nullif(l.issue->>'title', ''), 'Untitled finding'),
    coalesce(nullif(l.issue->>'description', ''), 'No description recorded.'),
    coalesce(nullif(l.issue->>'recommendation', ''), 'No recommendation recorded.'),
    nullif(l.issue->>'selector', ''),
    nullif(l.issue->>'pageUrl', ''),
    l.created_at,
    l.updated_at
FROM "_legacy_ux_issues" l;

DROP TABLE "_legacy_ux_issues";
