-- 031: one home for each piece of data.
--
-- 1. Resume / job-post analyses live only in resume_applications.
--    job_targets (per goal) and user_resume_workspaces (per user) duplicated
--    the same columns. Per-goal analyses that have a job post are moved into
--    resume_applications and linked to their goal; the old tables are dropped.
-- 2. Applications get a status so outcomes stop living only in analytics.
-- 3. Plans (goal_sprints) and mock interviews point at the saved target role
--    with a real foreign key instead of free text.
-- 4. Gap state history for readiness progress.
-- 5. Dead column cleanup.

-- 1. Resume analyses -------------------------------------------------------
INSERT INTO resume_applications
  (user_id, resume_id, title, target_role, target_company, jd_text, parsed_jd,
   resume_summary, gap_report, tailored_resume, tailored_resume_generated_at,
   linked_goal_id, last_analyzed_at, created_at, updated_at)
SELECT jt.user_id,
       jt.resume_id,
       COALESCE(NULLIF(jt.target_role, ''), 'Job post') ||
         CASE WHEN NULLIF(jt.target_company, '') IS NOT NULL
              THEN ' at ' || jt.target_company ELSE '' END,
       jt.target_role,
       jt.target_company,
       jt.jd_text,
       jt.parsed_jd,
       jt.resume_summary,
       jt.gap_report,
       jt.tailored_resume,
       jt.tailored_resume_generated_at,
       jt.goal_id,
       jt.last_analyzed_at,
       jt.created_at,
       jt.updated_at
  FROM job_targets jt
 WHERE NULLIF(TRIM(jt.jd_text), '') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM resume_applications ra
      WHERE ra.user_id = jt.user_id
        AND ra.linked_goal_id = jt.goal_id
        AND ra.jd_text = jt.jd_text
   );

DROP TABLE IF EXISTS job_targets;
DROP TABLE IF EXISTS user_resume_workspaces;

-- 2. Application status ----------------------------------------------------
ALTER TABLE resume_applications
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'saved',
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;

ALTER TABLE resume_applications
  DROP CONSTRAINT IF EXISTS resume_applications_status_check;
ALTER TABLE resume_applications
  ADD CONSTRAINT resume_applications_status_check
  CHECK (status IN ('saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn'));

CREATE INDEX IF NOT EXISTS idx_resume_applications_status
  ON resume_applications(user_id, status);

-- 3. Target role links -----------------------------------------------------
ALTER TABLE goal_sprints
  ADD COLUMN IF NOT EXISTS target_role_id UUID
  REFERENCES candidate_target_roles(id) ON DELETE SET NULL;

UPDATE goal_sprints gs
   SET target_role_id = ctr.id
  FROM candidate_target_roles ctr
 WHERE gs.target_role_id IS NULL
   AND ctr.user_id = gs.user_id
   AND (ctr.linked_sprint_id = gs.id OR ctr.linked_goal_id = gs.goal_id);

ALTER TABLE mock_interview_runs
  ADD COLUMN IF NOT EXISTS target_role_id UUID
  REFERENCES candidate_target_roles(id) ON DELETE SET NULL;

UPDATE mock_interview_runs mir
   SET target_role_id = gs.target_role_id
  FROM goal_sprints gs
 WHERE mir.target_role_id IS NULL
   AND gs.user_id = mir.user_id
   AND gs.goal_id = mir.goal_id
   AND gs.target_role_id IS NOT NULL;

-- 4. Gap events: every time a gap changes state we keep a row, so readiness
--    progress and "what changed this week" come from facts, not AI text.
CREATE TABLE IF NOT EXISTS gap_events (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id      VARCHAR(24) NOT NULL,
  gap_id       VARCHAR(24) NOT NULL,
  skill_area   VARCHAR(255) NOT NULL,
  from_status  VARCHAR(20),
  to_status    VARCHAR(20) NOT NULL,
  source       VARCHAR(40) NOT NULL,
  detail       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gap_events_goal
  ON gap_events(user_id, goal_id, created_at DESC);

-- 5. Dead columns ----------------------------------------------------------
ALTER TABLE concept_nodes DROP COLUMN IF EXISTS topic_engine_node_id;

-- 6. Strong mock interview answers count as proof.
ALTER TABLE candidate_evidence_claims
  DROP CONSTRAINT IF EXISTS candidate_evidence_claims_source_type_check;
ALTER TABLE candidate_evidence_claims
  ADD CONSTRAINT candidate_evidence_claims_source_type_check
  CHECK (source_type IN (
    'resume', 'linkedin', 'manual', 'github', 'portfolio',
    'sprint_artifact', 'application_outcome', 'user_correction', 'mock_interview'
  ));

-- 7. One review schedule per concept (inserts used ON CONFLICT DO NOTHING
--    without a unique key, so duplicates could pile up).
DELETE FROM spaced_repetition_queue a
 USING spaced_repetition_queue b
 WHERE a.user_id = b.user_id
   AND a.node_id = b.node_id
   AND (a.due_at, a.id) < (b.due_at, b.id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sr_queue_user_node
  ON spaced_repetition_queue(user_id, node_id);
