import { ObjectId } from 'mongodb';
import { getDb } from '../mongo';
import { pool } from '../postgres';
import {
  DEMO_APPLICATIONS,
  DEMO_CHECKINS,
  DEMO_GAPS,
  DEMO_GOAL,
  DEMO_MOCKS,
  DEMO_OWN_WORDS,
  DEMO_PROFILE,
  DEMO_RESUME_SUMMARY,
  DEMO_RESUME_TEXT,
  DEMO_REVIEW_DUE,
  DEMO_SESSIONS,
  DEMO_TARGET,
} from './demoPersona';
import { saveTargetRole } from '../../services/targetRoles';
import { buildRoleReadinessReport, persistRoleReadinessReport } from '../../services/roleReadiness';
import { createUpgradePlanForTargetRole, linkUpgradePlanExecution } from '../../services/upgradePlans';
import { rebaselineGoalSprint, saveGoalSprintDefinition } from '../../services/sprintPlanner';
import { syncGoalGaps } from '../../services/gapProgress';
import { publishGoalArtifactsAsEvidence, publishMockInterviewEvidence } from '../../services/candidateEvidence';
import { fetchNewsForUser } from '../../services/newsService';

/**
 * Builds (or rebuilds) the public demo account: a believable person three
 * weeks into their plan. Safe to run repeatedly; it wipes that one user's
 * data first. Never touches any other account.
 */

const DAY = 86_400_000;

function at(daysFromNow: number, hour = 12, minute = 0): Date {
  const date = new Date(Date.now() + daysFromNow * DAY);
  date.setUTCHours(hour - 5, minute + 30, 0, 0); // hour given in IST (UTC+5:30)
  return date;
}

function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export async function resetDemoUserData(userId: string): Promise<void> {
  const db = getDb();
  await Promise.all([
    db.collection('goals').deleteMany({ userId }),
    db.collection('goal_raw_inputs').deleteMany({ userId }),
    db.collection('goal_corrections').deleteMany({ userId }),
    db.collection('user_raw_inputs').deleteMany({ userId }),
    db.collection('path_outcomes').deleteMany({ userId }),
  ]);
  const statements = [
    'DELETE FROM concept_nodes WHERE user_id = $1',
    'DELETE FROM mock_interview_runs WHERE user_id = $1',
    'DELETE FROM weekly_checkins WHERE user_id = $1',
    'DELETE FROM weekly_summary_deliveries WHERE user_id = $1',
    'DELETE FROM gap_events WHERE user_id = $1',
    'DELETE FROM candidate_upgrade_plans WHERE user_id = $1',
    'DELETE FROM candidate_readiness_history WHERE user_id = $1',
    'DELETE FROM candidate_role_assessments WHERE user_id = $1',
    'DELETE FROM candidate_target_roles WHERE user_id = $1',
    'DELETE FROM goal_sprints WHERE user_id = $1',
    'DELETE FROM candidate_evidence_claims WHERE user_id = $1',
    'DELETE FROM resume_applications WHERE user_id = $1',
    'DELETE FROM user_resume WHERE user_id = $1',
    'DELETE FROM usage_events WHERE user_id = $1',
  ];
  for (const sql of statements) {
    await pool.query(sql, [userId]);
  }
}

export async function seedDemoAccount(email: string): Promise<{ userId: string; goalId: string }> {
  const { rows: users } = await pool.query<{ id: string }>(
    'SELECT id::text FROM users WHERE LOWER(email) = LOWER($1)',
    [email],
  );
  if (!users[0]) {
    throw new Error(`Demo user ${email} does not exist. Create it by signing up first.`);
  }
  const userId = users[0].id;
  await resetDemoUserData(userId);

  // ── Profile and resume ─────────────────────────────────────────────
  await pool.query(
    `INSERT INTO user_profiles_structured
       (user_id, job_title, role_type, seniority_level, years_total, employment_status,
        primary_stack, derived_by, available_mins_day, available_days_week, timezone)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'demo_seed', $8, $9, $10)
     ON CONFLICT (user_id) DO UPDATE SET
       job_title = EXCLUDED.job_title, role_type = EXCLUDED.role_type,
       seniority_level = EXCLUDED.seniority_level, years_total = EXCLUDED.years_total,
       employment_status = EXCLUDED.employment_status, primary_stack = EXCLUDED.primary_stack,
       available_mins_day = EXCLUDED.available_mins_day,
       available_days_week = EXCLUDED.available_days_week, timezone = EXCLUDED.timezone`,
    [
      userId,
      DEMO_PROFILE.jobTitle,
      DEMO_PROFILE.roleType,
      DEMO_PROFILE.seniorityLevel,
      DEMO_PROFILE.yearsTotal,
      DEMO_PROFILE.employmentStatus,
      JSON.stringify(DEMO_PROFILE.primaryStack),
      DEMO_PROFILE.availableMinsDay,
      DEMO_PROFILE.availableDaysWeek,
      DEMO_PROFILE.timezone,
    ],
  );
  const { rows: resumeRows } = await pool.query<{ id: string }>(
    `INSERT INTO user_resume (user_id, raw_text, parsed_data, parsed_at, source, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, 'manual', $4, $4) RETURNING id::text`,
    [userId, DEMO_RESUME_TEXT, JSON.stringify(DEMO_RESUME_SUMMARY), at(-21, 20)],
  );
  const resumeId = resumeRows[0].id;

  // ── Target role ────────────────────────────────────────────────────
  const saved = await saveTargetRole(userId, {
    roleProfileId: DEMO_TARGET.roleProfileId,
    candidateInput: {
      currentRole: DEMO_PROFILE.jobTitle,
      yearsExperience: 5,
      region: 'India',
      skills: DEMO_PROFILE.primaryStack,
      strongestAreas: ['API design', 'PostgreSQL performance', 'AWS'],
      preferredDirections: ['full_stack', 'product_engineering'],
      avoidedDirections: [],
      workStyle: ['building_products', 'systems'],
      targetSeniority: 'senior',
      freeTextContext: 'Want to own a product area end to end at a product company.',
    } as any,
  });
  const targetRoleId = saved.targetRole.id;
  await pool.query(
    `UPDATE candidate_target_roles SET title = $3, created_at = $4, updated_at = $4
      WHERE user_id = $1 AND id = $2`,
    [userId, targetRoleId, DEMO_TARGET.title, at(-21, 20, 30)],
  );

  // ── Goal (the plan) ───────────────────────────────────────────────
  const db = getDb();
  const goalObjectId = new ObjectId();
  const goalId = goalObjectId.toString();
  const createdAt = at(-21, 21);
  const gapDocs = DEMO_GAPS.map((gap) => ({
    _id: new ObjectId(),
    raw: null,
    userConfirmed: true,
    structured: {
      skillArea: gap.skillArea,
      skillCategory: gap.category,
      currentLevel: gap.current,
      requiredLevel: gap.required,
      priority: gap.priority,
      priorityReason: gap.reason,
      longevity: 'high',
      aiRelationship: 'amplified',
      identifiedBy: gap.identifiedBy,
      status: 'open',
      userConfirmed: true,
    },
  }));
  const topicDocs = DEMO_GAPS.map((gap, index) => ({
    _id: new ObjectId(),
    skillGapId: gapDocs[index]._id,
    raw: null,
    createdAt,
    completedAt: null,
    structured: {
      title: gap.topic.title,
      skillGapArea: gap.skillArea,
      rationale: gap.topic.rationale,
      estimatedWeeks: gap.topic.weeks,
      priority: gap.priority,
      topicEngineId: null,
      decompositionStatus: 'completed',
      decompositionAttempts: 1,
      lastDecompositionCompletedAt: createdAt,
      lastDecompositionError: null,
      status: 'pending',
      position: index + 1,
      actualWeeks: null,
    },
  }));
  await db.collection('goals').insertOne({
    _id: goalObjectId,
    userId,
    raw: {
      input: DEMO_OWN_WORDS,
      capturedAt: createdAt,
      source: 'target_role',
      targetRoleId,
      targetRoleTitle: DEMO_TARGET.title,
      roleProfileId: DEMO_TARGET.roleProfileId,
    },
    structured: {
      ...DEMO_GOAL,
      targetDate: at(DEMO_TARGET.targetDateWeeksFromNow * 7),
      targetDateFlexibility: 'fixed',
      confidenceLevel: 3,
      estimatedWeeks: 14,
      estimatedWeeksAtPace: 14,
      availableMinsDay: DEMO_PROFILE.availableMinsDay,
      derivedBy: 'demo_seed',
      derivedAt: createdAt,
    },
    skillGaps: gapDocs,
    learningTopics: topicDocs,
    milestones: [
      { structured: { title: '25% complete', triggerType: 'automatic' }, achievedAt: at(-12, 21), sequence: 1 },
      { structured: { title: 'Surface layer complete', triggerType: 'automatic' }, achievedAt: at(-13, 20), sequence: 2 },
      { structured: { title: '50% complete', triggerType: 'automatic' }, achievedAt: at(-3, 22), sequence: 3 },
    ],
    status: 'active',
    stage: 'action',
    isPrimary: true,
    pipelineRun: { type: 'decompose', status: 'done', steps: [], startedAt: createdAt, completedAt: createdAt },
    createdAt,
    updatedAt: new Date(),
    achievedAt: null,
    abandonedAt: null,
    abandonedReason: null,
  });
  await db.collection('goal_raw_inputs').insertOne({
    goalId,
    userId,
    inputs: [{ type: 'text', source: 'goal_intake', content: DEMO_OWN_WORDS, capturedAt: createdAt }],
  });

  // ── Concepts and prerequisites ────────────────────────────────────
  const nodeIds = new Map<string, string>();
  const topicOfConcept = new Map<string, string>();
  let position = 0;
  for (let gapIndex = 0; gapIndex < DEMO_GAPS.length; gapIndex += 1) {
    const topicId = topicDocs[gapIndex]._id.toString();
    for (const concept of DEMO_GAPS[gapIndex].concepts) {
      position += 1;
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO concept_nodes
           (user_id, goal_id, learning_topic_id, title, description, depth_level, boundary_type,
            node_type, estimated_mins, longevity, ai_relationship, resources, status, position,
            te_node_slug, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'core', 'concept', $7, 'high', 'amplified', '[]'::jsonb,
                 'locked', $8, $9, $10)
         RETURNING id::text`,
        [userId, goalId, topicId, concept.title, concept.description, concept.depth, concept.mins, position, concept.key, createdAt],
      );
      nodeIds.set(concept.key, rows[0].id);
      topicOfConcept.set(concept.key, topicId);
    }
  }
  for (const gap of DEMO_GAPS) {
    for (const concept of gap.concepts) {
      for (const requirement of concept.requires ?? []) {
        await pool.query(
          `INSERT INTO concept_edges (goal_id, learning_topic_id, from_node_id, to_node_id, edge_type)
           VALUES ($1, $2, $3, $4, 'hard_prerequisite')`,
          [goalId, topicOfConcept.get(concept.key), nodeIds.get(requirement), nodeIds.get(concept.key)],
        );
      }
    }
  }

  // ── Study sessions and written work ───────────────────────────────
  const lastByConcept = new Map<string, { confidence: number; at: Date }>();
  const seen = new Set<string>();
  for (const session of DEMO_SESSIONS) {
    const nodeId = nodeIds.get(session.concept)!;
    const startedAt = at(session.day, session.hour);
    const completedAt = new Date(startedAt.getTime() + session.mins * 60_000);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO study_sessions
         (user_id, node_id, session_type, started_at, completed_at, duration_mins, confidence_after)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::text`,
      [userId, nodeId, seen.has(session.concept) ? 'revisit' : 'new', startedAt, completedAt, session.mins, session.confidence],
    );
    seen.add(session.concept);
    const evaluated = session.score !== null;
    await pool.query(
      `INSERT INTO session_artifacts
         (session_id, user_id, node_id, task_type, artifact_type, prompt, content, status, score,
          feedback, evaluation, evaluated_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'apply', 'text', $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $11)`,
      [
        rows[0].id,
        userId,
        nodeId,
        'Apply this concept to something from your own work in a short write-up.',
        session.work,
        evaluated ? 'evaluated' : 'submitted',
        session.score,
        evaluated ? session.feedback : null,
        JSON.stringify(
          evaluated
            ? { score: session.score, feedback: session.feedback, strengths: session.strengths, improvements: session.improvements }
            : {},
        ),
        evaluated ? completedAt : null,
        completedAt,
      ],
    );
    lastByConcept.set(session.concept, { confidence: session.confidence, at: completedAt });
  }

  // Concept status: done if last rating was 3+, due for review if listed,
  // available if every prerequisite is done, otherwise locked.
  const done = new Set<string>();
  for (const [key, last] of lastByConcept) {
    if (last.confidence >= 3) done.add(key);
  }
  for (const gap of DEMO_GAPS) {
    for (const concept of gap.concepts) {
      const nodeId = nodeIds.get(concept.key)!;
      const last = lastByConcept.get(concept.key);
      let status: string;
      if (done.has(concept.key)) {
        status = DEMO_REVIEW_DUE.includes(concept.key) ? 'review_due' : 'done';
      } else if ((concept.requires ?? []).every((req) => done.has(req))) {
        status = 'available';
      } else {
        status = 'locked';
      }
      // Only the listed concepts are due now; the rest come up over the next week.
      const reviewOffset = (concept.title.length % 6) + 1;
      const dueAt = DEMO_REVIEW_DUE.includes(concept.key)
        ? at(-1, 9)
        : last
          ? new Date(Math.max(last.at.getTime() + (last.confidence >= 4 ? 7 : 3) * DAY, Date.now() + reviewOffset * DAY))
          : null;
      await pool.query(
        `UPDATE concept_nodes
            SET status = $2, confidence = $3, last_studied_at = $4, next_review_at = $5
          WHERE id = $1`,
        [nodeId, status, last?.confidence ?? null, last?.at ?? null, done.has(concept.key) ? dueAt : null],
      );
      if (last) {
        await pool.query(
          `INSERT INTO spaced_repetition_queue (node_id, user_id, due_at, interval_days, repetition_count, last_confidence)
           VALUES ($1, $2, $3, $4, 1, $5)
           ON CONFLICT (user_id, node_id) DO NOTHING`,
          [nodeId, userId, dueAt ?? at(1, 9), last.confidence >= 4 ? 7 : last.confidence >= 3 ? 3 : 1, last.confidence],
        );
      }
    }
  }

  // ── Plan deadline and pace ────────────────────────────────────────
  await saveGoalSprintDefinition(userId, goalId, {
    sprintType: 'senior_engineer',
    targetRole: DEMO_TARGET.title,
    targetCompany: null,
    targetDate: at(DEMO_TARGET.targetDateWeeksFromNow * 7).toISOString().slice(0, 10),
    weeklyCommitmentHours: DEMO_TARGET.weeklyHours,
    currentBlockers: ['Release weeks at work eat study time'],
    successEvidence: ['Pass a senior design round', 'Two strong project stories', 'An offer from a product company'],
  });
  await pool.query(
    `UPDATE goal_sprints SET target_role_id = $3, created_at = $4 WHERE user_id = $1 AND goal_id = $2`,
    [userId, goalId, targetRoleId, createdAt],
  );
  await rebaselineGoalSprint(userId, goalId);
  const { rows: sprintRows } = await pool.query<{ id: string }>(
    'SELECT id::text FROM goal_sprints WHERE user_id = $1 AND goal_id = $2',
    [userId, goalId],
  );

  // ── Mock interviews ───────────────────────────────────────────────
  const gapIdByArea = new Map(gapDocs.map((gap) => [gap.structured.skillArea, gap._id.toString()]));
  const mockSignals = new Map<string, Array<{ runId: string; mode: string; score: number; at: string }>>();
  for (const mock of DEMO_MOCKS) {
    const startedAt = at(mock.day, 20);
    const completedAt = new Date(startedAt.getTime() + 35 * 60_000);
    const evaluation = {
      overallScore: mock.overall,
      verdict: mock.verdict,
      summary: mock.summary,
      rubricScores: mock.scores,
      strengths: mock.strengths,
      improvements: mock.improvements,
      retryPlan: mock.retryPlan,
      suggestedSprintEdits: [],
      planUpdate: { ...mock.planUpdate, proofAdded: mock.planUpdate.strong, changes: [] },
    };
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO mock_interview_runs
         (user_id, goal_id, mode, status, target_role, focus_area, opening_prompt, latest_prompt,
          transcript_summary, overall_score, evaluation, target_role_id, created_at, updated_at, completed_at)
       VALUES ($1, $2, $3, 'completed', $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $13)
       RETURNING id::text`,
      [
        userId, goalId, mock.mode, DEMO_TARGET.title, mock.focus,
        mock.turns[0].content, mock.turns[mock.turns.length - 2]?.content ?? mock.turns[0].content,
        mock.summary, mock.overall, JSON.stringify(evaluation), targetRoleId, startedAt, completedAt,
      ],
    );
    const runId = rows[0].id;
    // The opening question is turn 0; each answer and its follow-up share the next index.
    let turnIndex = 0;
    for (let position = 0; position < mock.turns.length; position += 1) {
      const turn = mock.turns[position];
      if (turn.role === 'candidate') turnIndex += 1;
      await pool.query(
        `INSERT INTO mock_interview_turns (run_id, turn_index, role, content, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [runId, turnIndex, turn.role, turn.content, new Date(startedAt.getTime() + position * 3 * 60_000)],
      );
    }
    for (const score of mock.scores) {
      await pool.query(
        'INSERT INTO mock_interview_scores (run_id, dimension, score, feedback) VALUES ($1, $2, $3, $4)',
        [runId, score.dimension, score.score, score.feedback],
      );
    }
    const list = mockSignals.get(mock.planUpdate.gapSkillArea) ?? [];
    list.push({ runId, mode: mock.mode, score: mock.overall, at: completedAt.toISOString() });
    mockSignals.set(mock.planUpdate.gapSkillArea, list);
    if (mock.planUpdate.strong) {
      await publishMockInterviewEvidence(userId, {
        runId,
        goalId,
        mode: mock.mode,
        overallScore: mock.overall,
        summary: mock.summary,
        targetRoleTitle: DEMO_TARGET.title,
        targetRoleId,
      });
    }
  }
  const goalWithSignals = gapDocs.map((gap) => {
    const signals = mockSignals.get(gap.structured.skillArea);
    if (!signals) return gap;
    const last = signals[signals.length - 1];
    return {
      ...gap,
      structured: { ...gap.structured, mockSignals: signals, needsPractice: last.score <= 2 },
    };
  });
  await db.collection('goals').updateOne({ _id: goalObjectId }, { $set: { skillGaps: goalWithSignals } });

  // ── Resume checks against job posts ───────────────────────────────
  for (const application of DEMO_APPLICATIONS) {
    const created = at(-application.daysAgo, 19);
    const gapReport = {
      targetRole: DEMO_TARGET.title,
      readinessLabel: application.fitScore >= 70 ? 'close' : 'building',
      summary: `About ${application.fitScore}% of what ${application.company} asks for is clearly shown on your resume.`,
      requirementCoverage: [],
      strengths: application.strengths,
      missingSkills: application.missingSkills,
      missingProof: application.missingProof,
      sprintEdits: [],
      interviewRisks: application.interviewRisks,
      portfolioSuggestion: null,
      confidence: 72,
    };
    const parsedJd = {
      targetRole: application.title.split(' at ')[0],
      senioritySignal: 'senior',
      mustHaveSkills: [],
      preferredSkills: [],
      evidenceSignals: [],
      responsibilities: [],
      hiringGoals: [],
    };
    await pool.query(
      `INSERT INTO resume_applications
         (user_id, resume_id, title, target_role, target_company, jd_text, parsed_jd, resume_summary,
          gap_report, linked_goal_id, target_role_id, status, status_updated_at, applied_at,
          last_analyzed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12, $13, $14, $15, $15, $13)`,
      [
        userId, resumeId, application.title, parsedJd.targetRole, application.company, application.jd,
        JSON.stringify(parsedJd), JSON.stringify(DEMO_RESUME_SUMMARY), JSON.stringify(gapReport),
        application.status === 'saved' ? null : goalId, targetRoleId, application.status,
        application.appliedDaysAgo !== null ? at(-application.appliedDaysAgo + 5, 18) : created,
        application.appliedDaysAgo !== null ? at(-application.appliedDaysAgo, 18) : null,
        created,
      ],
    );
  }

  // ── Weekly check-ins ──────────────────────────────────────────────
  for (const checkin of DEMO_CHECKINS) {
    const weekDate = at(-7 * checkin.weeksAgo, 20);
    const recoveryPlan = {
      status: checkin.momentum <= 2 ? 'reduce_scope' : 'steady',
      headline:
        checkin.momentum <= 2
          ? 'A heavy week at work. Smaller sessions keep the streak alive.'
          : 'On pace. Keep the morning sessions.',
      catchUpMinutes: checkin.momentum <= 2 ? 150 : 0,
      focusAreas: checkin.blockers.slice(0, 2),
      actions:
        checkin.momentum <= 2
          ? ['Plan for 8 h this week instead of 10', 'Do 20-minute sessions on busy days']
          : ['Keep studying before work', 'Redo the estimates concept'],
      riskSummary: checkin.notes ?? '',
      shouldReduceScope: checkin.momentum <= 2,
      nextReviewDate: null,
      quickFixes: [],
    };
    await pool.query(
      `INSERT INTO weekly_checkins
         (user_id, goal_id, week_start, confidence, momentum, blockers, wins, notes, recovery_plan, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::jsonb, $10, $10)`,
      [
        userId, goalId, mondayOf(weekDate), checkin.confidence, checkin.momentum,
        JSON.stringify(checkin.blockers), JSON.stringify(checkin.wins), checkin.notes,
        JSON.stringify(recoveryPlan), weekDate,
      ],
    );
  }

  // ── Proof, gap state, readiness ───────────────────────────────────
  await publishGoalArtifactsAsEvidence(userId, goalId);
  await syncGoalGaps(userId, goalId, 'seed');
  // Replace the seed's own events with a believable history.
  await pool.query('DELETE FROM gap_events WHERE user_id = $1', [userId]);
  const history: Array<[number, string, string | null, string, string, Record<string, unknown>]> = [
    [-16, DEMO_GAPS[0].skillArea, 'open', 'closing', 'session', {}],
    [-17, DEMO_GAPS[2].skillArea, 'open', 'closing', 'session', {}],
    [-19, DEMO_GAPS[1].skillArea, 'open', 'closing', 'session', {}],
    [-14, DEMO_GAPS[0].skillArea, 'closing', 'closing', 'mock_interview', { score: 2, priorityFrom: 1, priorityTo: 1 }],
    [-13, DEMO_GAPS[3].skillArea, 'open', 'closing', 'session', {}],
    [-4, DEMO_GAPS[3].skillArea, 'closing', 'closed', 'session', {}],
    [-2, DEMO_GAPS[3].skillArea, 'closed', 'proven', 'mock_interview', { score: 4 }],
  ];
  for (const [day, area, from, to, source, detail] of history) {
    await pool.query(
      `INSERT INTO gap_events (user_id, goal_id, gap_id, skill_area, from_status, to_status, source, detail, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
      [userId, goalId, gapIdByArea.get(area) ?? 'seed', area, from, to, source, JSON.stringify(detail), at(day, 21)],
    );
  }

  const generated = await buildRoleReadinessReport(userId, targetRoleId, { includeAiSummary: false });
  const report = await persistRoleReadinessReport(userId, targetRoleId, generated);
  const current = report.score.overall;
  for (const [day, delta] of [[-20, -19], [-10, -8]] as const) {
    await pool.query(
      `INSERT INTO candidate_readiness_history
         (user_id, target_role_id, assessment_id, overall_score, readiness_label, verdict, score_breakdown, created_at)
       SELECT user_id, target_role_id, id, $3, 'building', verdict, '{}'::jsonb, $4
         FROM candidate_role_assessments WHERE id = $2 AND user_id = $1`,
      [userId, report.id, Math.max(10, current + delta), at(day, 21)],
    ).catch(() => undefined);
  }

  const plan = await createUpgradePlanForTargetRole({
    userId,
    targetRoleId,
    readinessReportId: report.id,
    durationWeeks: 8,
    weeklyCommitmentHours: DEMO_TARGET.weeklyHours,
  });
  await linkUpgradePlanExecution(userId, targetRoleId, plan.upgradePlan.id, {
    goalId,
    sprintId: sprintRows[0]?.id ?? null,
  });
  await pool.query(
    `UPDATE candidate_target_roles
        SET linked_goal_id = $3, linked_sprint_id = $4, status = 'sprint_active', updated_at = NOW()
      WHERE user_id = $1 AND id = $2`,
    [userId, targetRoleId, goalId, sprintRows[0]?.id ?? null],
  );
  // The hand-written plan already covers these gaps; don't merge the generated one in.
  await db.collection('goals').updateOne({ _id: goalObjectId }, { $set: { 'raw.upgradePlanId': plan.upgradePlan.id } });

  // News is live data from Hacker News; skip quietly if it can't be reached.
  await fetchNewsForUser(userId).catch(() => 0);

  return { userId, goalId };
}
