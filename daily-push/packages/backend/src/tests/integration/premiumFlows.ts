import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { pool, testPostgresConnection } from '../../db/postgres';
import { closeMongo, connectMongo, getDb } from '../../db/mongo';
import { buildGoalArtifactExport } from '../../services/artifactExports';
import { createCheckoutSession } from '../../services/billing';
import { getEntitlementSummaries } from '../../services/entitlements';
import {
  rebuildGoalGapReport,
  saveGoalJobDescription,
  saveGoalResume,
} from '../../services/jobGapAnalysis';
import {
  evaluateMockInterviewRun,
  startMockInterviewRun,
  submitMockInterviewAnswer,
} from '../../services/mockInterviews';
import { createSession, completeSession } from '../../services/sessions';
import { getSessionTask, saveSessionArtifact } from '../../services/sessionTasks';
import { getWeeklyReport, saveGoalWeeklyCheckin } from '../../services/weeklyCheckins';

interface TestUser {
  id: string;
  email: string;
}

interface TestGoal {
  id: string;
  title: string;
}

async function createTestUser(): Promise<TestUser> {
  const email = `integration_${Date.now()}@example.com`;
  const { rows } = await pool.query<{ id: string; email: string }>(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, $2, $3)
     RETURNING id, email`,
    [email, 'integration-test-hash', 'Integration Test User'],
  );

  return rows[0];
}

async function createTestGoal(userId: string): Promise<TestGoal> {
  const db = getDb();
  const goalId = new ObjectId();
  const title = 'Integration Premium Sprint Goal';

  await db.collection('goals').insertOne({
    _id: goalId,
    userId,
    isPrimary: true,
    status: 'active',
    raw: {
      input: 'Become a stronger AI engineer with better system design evidence.',
    },
    structured: {
      title,
      goalType: 'career_transition',
      urgency: 'planning',
      emotionalDriver: 'growth',
      statedWhy: 'Need a stronger premium regression test path.',
      successCriteria: 'Complete one artifact, one report, and one mock interview.',
      confidenceLevel: 3,
    },
    sprint: {
      sprintType: 'ai_engineer_transition',
      templateLabel: 'AI Engineer Sprint',
      targetRole: 'Senior AI Engineer',
      targetCompany: 'Acme AI',
      targetDate: null,
      weeklyCommitmentHours: 6,
      currentBlockers: ['Need stronger architecture evidence'],
      successEvidence: ['Mock interview score', 'Reusable artifact export'],
      status: 'planned',
      riskScore: 45,
      completionScore: 10,
      weeklyTargetMinutes: 360,
      recommendedDailyMinutes: 72,
      forecastedCompletionDate: null,
      bufferDays: null,
      nextReviewAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastHealthComputedAt: null,
    },
    skillGaps: [],
    learningTopics: [],
    pipelineRun: {
      status: 'done',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return {
    id: goalId.toHexString(),
    title,
  };
}

async function seedConceptNode(userId: string, goalId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO concept_nodes (
       user_id,
       goal_id,
       learning_topic_id,
       title,
       description,
       depth_level,
       boundary_type,
       node_type,
       estimated_mins,
       longevity,
       ai_relationship,
       status,
       position
     ) VALUES (
       $1,
       $2,
       NULL,
       'Premium integration node',
       'A seeded concept node used for premium integration coverage.',
       'surface',
       'core',
       'concept',
       30,
       'high',
       'amplified',
       'available',
       1
     )
     RETURNING id`,
    [userId, goalId],
  );

  return rows[0].id;
}

async function run(): Promise<void> {
  await testPostgresConnection();
  await connectMongo();

  const user = await createTestUser();
  const goal = await createTestGoal(user.id);
  const nodeId = await seedConceptNode(user.id, goal.id);

  const checkout = await createCheckoutSession(user.id, {
    planKey: 'sprint',
    intervalKey: 'month',
    email: user.email,
  });
  assert.equal(checkout.autoActivated, true, 'Sprint checkout should auto-activate in manual mode');

  const entitlements = await getEntitlementSummaries(user.id);
  const entitlementMap = new Map(
    entitlements.map((entry) => [entry.featureKey, entry]),
  );
  assert.equal(
    entitlementMap.get('premium_sprints.enabled')?.enabled,
    true,
    'Sprint plan should unlock premium sprints',
  );
  assert.equal(
    entitlementMap.get('weekly_reports.enabled')?.enabled,
    true,
    'Sprint plan should unlock weekly reports',
  );
  assert.equal(
    entitlementMap.get('mock_interviews.monthly')?.enabled,
    true,
    'Sprint plan should unlock mock interviews',
  );
  assert.equal(
    entitlementMap.get('artifacts.export.enabled')?.enabled,
    true,
    'Sprint plan should unlock artifact export',
  );

  const sessionId = await createSession(user.id, nodeId, 'new', 30);
  const task = await getSessionTask(sessionId, user.id);
  assert.equal(task.taskType, 'explain');

  const artifactText =
    'This premium integration artifact explains the concept, gives a realistic AI engineering example, and names a concrete trade-off.';
  const savedTask = await saveSessionArtifact(sessionId, user.id, artifactText);
  assert.equal(savedTask.artifact?.status, 'submitted');

  await completeSession(
    sessionId,
    user.id,
    4,
    32,
    'Completed during integration coverage.',
  );

  const artifactExport = await buildGoalArtifactExport(user.id, goal.id);
  assert.equal(artifactExport.artifactCount, 1, 'Artifact export should include one saved artifact');
  assert.equal(
    artifactExport.artifacts[0]?.content,
    artifactText,
    'Artifact export should contain the saved artifact text',
  );

  const resume = await saveGoalResume(
    user.id,
    goal.id,
    `Senior backend engineer with 6 years of experience in TypeScript, Node.js, Docker, PostgreSQL, and OpenAI-powered tooling.
Owned production APIs, shipped AI-assisted workflows, and led cross-functional delivery work.`,
    'manual',
  );
  assert.ok(
    resume.resumeSummary.coreSkills.length > 0,
    'Resume parsing should return core skills',
  );

  const jobDescription = await saveGoalJobDescription(user.id, goal.id, {
    targetRole: 'Senior AI Engineer',
    targetCompany: 'Acme AI',
    jdText:
      'We are hiring a Senior AI Engineer with strong TypeScript, Node.js, Docker, system design, and OpenAI API experience. You will own production systems, work cross-functionally, and design scalable AI features.',
  });
  assert.ok(
    jobDescription.parsedJd.mustHaveSkills.length > 0,
    'Job description parsing should return must-have skills',
  );

  const gapRecord = await rebuildGoalGapReport(user.id, goal.id);
  assert.ok(gapRecord.gapReport, 'Gap report should be generated');
  assert.equal(
    gapRecord.gapReport?.targetRole,
    'Senior AI Engineer',
    'Gap report should keep the target role',
  );

  const mockRun = await startMockInterviewRun(user.id, {
    goalId: goal.id,
    mode: 'system_design',
    targetRole: 'Senior AI Engineer',
    focusArea: 'AI service reliability',
    promptContext: 'Discuss trade-offs for scaling an LLM-backed product.',
    quota: {
      featureKey: 'mock_interviews.monthly',
      remaining: 7,
      limitValue: 8,
    },
  });
  assert.equal(mockRun.status, 'in_progress');

  const answeredRun = await submitMockInterviewAnswer(
    user.id,
    mockRun.id,
    'I would begin by clarifying traffic, latency, and safety constraints, then separate the orchestration layer from model calls, add caching, monitor fallback quality, and define how we degrade safely when the model or vector store fails.',
  );
  assert.equal(answeredRun.turnCount, 1, 'Mock run should store the first candidate answer');

  const evaluatedRun = await evaluateMockInterviewRun(user.id, mockRun.id);
  assert.equal(evaluatedRun.status, 'completed');
  assert.ok(
    (evaluatedRun.evaluation?.overallScore ?? 0) >= 1,
    'Mock interview evaluation should produce a score',
  );

  const weeklyCheckin = await saveGoalWeeklyCheckin(user.id, goal.id, {
    confidence: 3,
    momentum: 4,
    blockers: ['Need more system design examples'],
    wins: ['Completed the premium regression artifact'],
    notes: 'Integration coverage check-in.',
  });
  assert.ok(
    weeklyCheckin.recoveryPlan &&
      weeklyCheckin.recoveryPlan.actions.length > 0,
    'Weekly check-in should include a recovery plan',
  );

  const weeklyReport = await getWeeklyReport(user.id, goal.id);
  assert.ok(weeklyReport, 'Weekly report should resolve for the sprint goal');
  assert.equal(weeklyReport?.goalId, goal.id);
  assert.ok(
    weeklyReport?.stats.sessionsThisWeek !== undefined,
    'Weekly report should include session stats',
  );

  console.log('PASS entitlements unlocked for sprint plan');
  console.log('PASS premium session happy path saved an artifact and exported it');
  console.log('PASS gap report generated from saved resume and JD');
  console.log('PASS mock interview completed with evaluation');
  console.log('PASS weekly report and recovery plan resolved');
}

run()
  .catch((error) => {
    console.error('FAIL premium integration suite');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongo().catch(() => {});
    await pool.end().catch(() => {});
  });
