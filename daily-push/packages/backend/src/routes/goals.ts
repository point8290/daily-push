import axios from "axios";
import { Router, Request, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { getDb } from "../db/mongo";
import { pool } from "../db/postgres";
import {
  getGoalInputs,
  saveGoalCorrection,
  getGoalCorrections,
  extractProfile,
  classifyGoal,
  analyzeSkillGaps,
  mapLearningTopics,
  calculateTimeline,
  updateGoalWithPlan,
} from "../services/intake";
import {
  decomposeGoal,
  getGoalNodes,
  DecomposeTrackerHooks,
} from "../services/decomposition";
import { suggestNextGoals } from "../services/similarity";
import { getResumeApplication, linkResumeApplicationGoal } from "../services/jobGapAnalysis";
import { syncGoalGaps } from "../services/gapProgress";
import { config } from "../config";
import { requireEntitlement } from "../middleware/requireEntitlement";
import {
  buildDecomposeSteps,
  initPipelineRun,
  setStepStatus,
  finalizePipelineRun,
  failPipelineRun,
  getPipelineRun,
} from "../services/pipelineTracker";
import { sendPipelineCompleteEmail } from "../services/emailService";
import { trackProductEvent } from "../services/productEvents";
import {
  applyRecoveryAction,
  attachSprint,
  getGoalPlanHealth,
  type RecoveryAction,
  isPremiumSprintType,
  rebaselineGoalSprint,
  saveGoalSprintDefinition,
} from "../services/sprintPlanner";
import { assertEntitlementEnabled } from "../services/entitlements";

const router = Router();

// ─── Private helpers ──────────────────────────────────────────────────────────

function buildTrackerHooks(goalId: string): DecomposeTrackerHooks {
  return {
    onTopicStart: (stepId) => setStepStatus(goalId, stepId, "running"),
    onTopicDone: (stepId) => setStepStatus(goalId, stepId, "done"),
    onTopicFail: (stepId, error) =>
      setStepStatus(goalId, stepId, "failed", error),
    onUnlockStart: () => setStepStatus(goalId, "unlock_logic", "running"),
    onUnlockDone: () => setStepStatus(goalId, "unlock_logic", "done"),
  };
}

function mapDecomposeStatusToEventKey(
  status: "running" | "done" | "partial" | "failed",
): "decompose_completed" | "decompose_partial" | "decompose_failed" {
  switch (status) {
    case "done":
      return "decompose_completed";
    case "partial":
      return "decompose_partial";
    case "running":
    case "failed":
    default:
      return "decompose_failed";
  }
}

async function runDecompositionInBackground({
  userId,
  goalId,
  seniorityLevel,
  requestedTopicCount,
  retryMode,
  tracker,
  logLabel,
}: {
  userId: string;
  goalId: string;
  seniorityLevel: string | null;
  requestedTopicCount: number;
  retryMode: boolean;
  tracker: DecomposeTrackerHooks;
  logLabel: string;
}): Promise<void> {
  const startedAt = Date.now();

  try {
    const result = await decomposeGoal(
      userId,
      goalId,
      seniorityLevel,
      tracker,
    );
    const pipelineStatus = await finalizePipelineRun(goalId);

    await trackProductEvent({
      userId,
      goalId,
      eventKey: mapDecomposeStatusToEventKey(pipelineStatus),
      properties: {
        retryMode,
        requestedTopicCount,
        durationMs: Date.now() - startedAt,
        nodesCreated: result.nodesCreated,
        topicsDecomposed: result.topicsDecomposed,
        topicsFailed: result.topicsFailed,
        totalTopicsProcessed:
          result.topicsDecomposed + result.topicsFailed,
        pipelineStatus,
      },
    });

    await sendPipelineCompleteEmail(userId, goalId, result);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await failPipelineRun(goalId);
    await trackProductEvent({
      userId,
      goalId,
      eventKey: "decompose_failed",
      properties: {
        retryMode,
        requestedTopicCount,
        durationMs: Date.now() - startedAt,
        unexpectedError: true,
        errorMessage,
      },
    });
    console.error(`[${logLabel}] background pipeline error:`, err);
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/goals — list user's goals (newest first)
router.get(
  "/",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const db = getDb();
      const goals = await db
        .collection("goals")
        .find({ userId })
        .sort({ createdAt: -1 })
        .project({
          "raw.input": 1,
          "structured.title": 1,
          "structured.goalType": 1,
          status: 1,
          isPrimary: 1,
          createdAt: 1,
        })
        .toArray();
      res.json(goals);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/goals/primary — get the user's active primary goal
router.get(
  "/primary",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const db = getDb();
      let goal = await db
        .collection("goals")
        .findOne({ userId, isPrimary: true });

      // Older builds made every freshly opened "new goal" draft the primary
      // goal. If the primary is still an unfinished draft while a real goal
      // exists, hand back the real goal and repair the flag.
      if (!goal || goal.status === "intake_in_progress") {
        const activeGoal = await db
          .collection("goals")
          .findOne({ userId, status: "active" }, { sort: { updatedAt: -1 } });
        if (activeGoal) {
          await db
            .collection("goals")
            .updateMany({ userId, isPrimary: true }, { $set: { isPrimary: false } });
          await db
            .collection("goals")
            .updateOne({ _id: activeGoal._id }, { $set: { isPrimary: true } });
          goal = { ...activeGoal, isPrimary: true };
        }
      }

      if (!goal) {
        res.status(404).json({ error: "No primary goal found" });
        return;
      }
      res.json(await attachSprint(goal as any));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/goals/:id — get full goal document
router.get(
  "/:id",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const db = getDb();

      let id: ObjectId;
      try {
        id = new ObjectId(String(req.params.id));
      } catch {
        res.status(400).json({ error: "Invalid goal id" });
        return;
      }

      const goal = await db.collection("goals").findOne({ _id: id, userId });
      if (!goal) {
        res.status(404).json({ error: "Goal not found" });
        return;
      }
      // The user's own first description of the goal, shown next to the AI summary.
      const inputs = await getGoalInputs(id.toString(), userId).catch(() => []);
      const ownWords =
        inputs.find((input) => input.source === "goal_intake" && input.content?.trim())?.content?.trim() ??
        null;
      res.json({ ...(await attachSprint(goal as any)), ownWords });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/goals/:id/progress — gap by gap: open, closing, closed, proven,
// plus readiness progress and what changed recently.
router.get(
  "/:id/progress",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const goalId = String(req.params.id);
      if (!ObjectId.isValid(goalId)) {
        res.status(400).json({ error: "Invalid goal id" });
        return;
      }
      const { progress } = await syncGoalGaps(userId, goalId, "view");
      if (!progress) {
        res.status(404).json({ error: "Goal not found" });
        return;
      }
      res.json(progress);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/goals/:id/work — the user's written work for this plan, newest
// first, with the feedback it got. This is their best proof.
router.get(
  "/:id/work",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const goalId = String(req.params.id);
      if (!ObjectId.isValid(goalId)) {
        res.status(400).json({ error: "Invalid goal id" });
        return;
      }
      const { rows } = await pool.query<{
        id: string;
        session_id: string;
        node_title: string;
        topic_id: string | null;
        prompt: string | null;
        content: string | null;
        status: string;
        score: number | null;
        feedback: string | null;
        evaluation: Record<string, unknown> | null;
        updated_at: Date;
      }>(
        `SELECT sa.id::text, sa.session_id::text, cn.title AS node_title,
                cn.learning_topic_id AS topic_id, sa.prompt, sa.content, sa.status,
                sa.score, sa.feedback, sa.evaluation, sa.updated_at
           FROM session_artifacts sa
           JOIN concept_nodes cn ON cn.id = sa.node_id
          WHERE sa.user_id = $1
            AND cn.goal_id = $2
            AND sa.content IS NOT NULL
            AND LENGTH(TRIM(sa.content)) > 0
          ORDER BY sa.updated_at DESC
          LIMIT 100`,
        [userId, goalId],
      );
      res.json(
        rows.map((row) => ({
          id: row.id,
          sessionId: row.session_id,
          conceptTitle: row.node_title,
          topicId: row.topic_id,
          prompt: row.prompt,
          content: row.content,
          status: row.status,
          score: row.score,
          feedback: row.feedback,
          strengths: Array.isArray((row.evaluation as any)?.strengths) ? (row.evaluation as any).strengths : [],
          improvements: Array.isArray((row.evaluation as any)?.improvements) ? (row.evaluation as any).improvements : [],
          updatedAt: row.updated_at.toISOString(),
        })),
      );
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/goals/:id/pipeline — return current pipelineRun for polling
router.get(
  "/:id/pipeline",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;

      let id: ObjectId;
      try {
        id = new ObjectId(String(req.params.id));
      } catch {
        res.status(400).json({ error: "Invalid goal id" });
        return;
      }

      const run = await getPipelineRun(id.toString(), userId);
      if (!run) {
        res.status(404).json({ error: "No pipeline run found for this goal" });
        return;
      }
      res.json(run);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/goals/:id/confirm — user confirms the plan, goal becomes active
router.post(
  "/:id/confirm",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const db = getDb();

      let id: ObjectId;
      try {
        id = new ObjectId(String(req.params.id));
      } catch {
        res.status(400).json({ error: "Invalid goal id" });
        return;
      }

      const goal = await db.collection("goals").findOne({ _id: id, userId });
      if (!goal) {
        res.status(404).json({ error: "Goal not found" });
        return;
      }

      const { availableMinsDay } = req.body;
      const update: Record<string, any> = {
        status: "active",
        stage: "action",
        isPrimary: true,
        updatedAt: new Date(),
      };
      // A newly confirmed goal becomes the one Today plans around.
      await db
        .collection("goals")
        .updateMany({ userId, isPrimary: true, _id: { $ne: id } }, { $set: { isPrimary: false } });
      if (availableMinsDay)
        update["structured.availableMinsDay"] = availableMinsDay;

      await db.collection("goals").updateOne({ _id: id }, { $set: update });
      await rebaselineGoalSprint(userId, id.toString());
      void trackProductEvent({
        userId,
        goalId: id.toString(),
        eventKey: "goal_confirmed",
        properties: {
          availableMinsDay: availableMinsDay ?? null,
          status: "active",
          stage: "action",
        },
      });
      res.json({ confirmed: true });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/goals/:id/sprint - create or update sprint metadata for a goal
router.post(
  "/:id/sprint",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      let id: ObjectId;
      try {
        id = new ObjectId(String(req.params.id));
      } catch {
        res.status(400).json({ error: "Invalid goal id" });
        return;
      }
      const db = getDb();
      const goal = await db.collection("goals").findOne({ _id: id, userId });
      if (!goal) {
        res.status(404).json({ error: "Goal not found" });
        return;
      }

      if (isPremiumSprintType(req.body?.sprintType ?? "standard")) {
        await assertEntitlementEnabled(userId, "premium_sprints.enabled");
      }

      const sprint = await saveGoalSprintDefinition(userId, id.toString(), req.body);
      const health = await rebaselineGoalSprint(userId, id.toString());

      void trackProductEvent({
        userId,
        goalId: id.toString(),
        eventKey: "goal_sprint_saved",
        properties: {
          sprintType: sprint.sprintType,
          hasTargetDate: !!sprint.targetDate,
          weeklyCommitmentHours: sprint.weeklyCommitmentHours,
          blockerCount: sprint.currentBlockers.length,
          successEvidenceCount: sprint.successEvidence.length,
          status: health.status,
        },
      });

      res.json({ sprint: health.sprint, planHealth: health });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/goals/:id/rebaseline - recompute sprint health after plan changes
router.post(
  "/:id/rebaseline",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      let id: ObjectId;
      try {
        id = new ObjectId(String(req.params.id));
      } catch {
        res.status(400).json({ error: "Invalid goal id" });
        return;
      }
      const db = getDb();
      const goal = await db.collection("goals").findOne({ _id: id, userId });
      if (!goal) {
        res.status(404).json({ error: "Goal not found" });
        return;
      }

      if (req.body && Object.keys(req.body).length > 0) {
        if (isPremiumSprintType(req.body?.sprintType ?? "standard")) {
          await assertEntitlementEnabled(userId, "premium_sprints.enabled");
        }
        await saveGoalSprintDefinition(userId, id.toString(), req.body);
      }

      const health = await rebaselineGoalSprint(userId, id.toString());
      res.json(health);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/goals/:id/plan-health - sprint forecast and progress summary
router.get(
  "/:id/plan-health",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      let id: ObjectId;
      try {
        id = new ObjectId(String(req.params.id));
      } catch {
        res.status(400).json({ error: "Invalid goal id" });
        return;
      }
      const db = getDb();
      const goal = await db.collection("goals").findOne({ _id: id, userId });
      if (!goal) {
        res.status(404).json({ error: "Goal not found" });
        return;
      }

      const health = await getGoalPlanHealth(userId, id.toString());
      res.json(health);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/goals/:id/decompose — trigger Topic Engine decomposition for all learning topics
router.post(
  "/:id/decompose",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;

      let id: ObjectId;
      try {
        id = new ObjectId(String(req.params.id));
      } catch {
        res.status(400).json({ error: "Invalid goal id" });
        return;
      }

      const db = getDb();
      const goal = await db.collection("goals").findOne({ _id: id, userId });
      if (!goal) {
        res.status(404).json({ error: "Goal not found" });
        return;
      }
      if (goal.status !== "active") {
        res
          .status(400)
          .json({
            error:
              "Goal must be active before decomposing. Confirm the plan first.",
          });
        return;
      }

      // Guard: prevent double-run
      const anyInProgress = (goal.learningTopics as any[]).some(
        (t: any) => t.structured?.decompositionStatus === "in_progress",
      );
      if (anyInProgress) {
        res.status(400).json({ error: "Decomposition is already running" });
        return;
      }

      const nonCompleted = (goal.learningTopics as any[])
        .map((t: any, index: number) => ({ t, index }))
        .filter(({ t }) => t.structured?.decompositionStatus !== "completed")
        .map(({ t, index }) => ({ title: t.structured?.title ?? "", index }));

      const steps = buildDecomposeSteps(nonCompleted);
      const goalId = id.toString();
      await initPipelineRun(goalId, "decompose", steps);

      const { rows: profileRows } = await pool.query<{
        seniority_level: string;
      }>(
        "SELECT seniority_level FROM user_profiles_structured WHERE user_id = $1",
        [userId],
      );
      const seniorityLevel = profileRows[0]?.seniority_level ?? null;

      // Respond immediately — client polls GET /:id/pipeline for live step progress
      res.json({ accepted: true, pipelineStatus: "running" });

      // Background: decompose → finalize → email (resource enrichment runs via BullMQ automatically)
      void trackProductEvent({
        userId,
        goalId,
        eventKey: "decompose_started",
        properties: {
          retryMode: false,
          requestedTopicCount: nonCompleted.length,
        },
      });
      void runDecompositionInBackground({
        userId,
        goalId,
        seniorityLevel,
        requestedTopicCount: nonCompleted.length,
        retryMode: false,
        tracker: buildTrackerHooks(goalId),
        logLabel: "decompose",
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/goals/:id/decompose/retry — re-run only failed topics
router.post(
  "/:id/decompose/retry",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;

      let id: ObjectId;
      try {
        id = new ObjectId(String(req.params.id));
      } catch {
        res.status(400).json({ error: "Invalid goal id" });
        return;
      }

      const db = getDb();
      const goal = await db.collection("goals").findOne({ _id: id, userId });
      if (!goal) {
        res.status(404).json({ error: "Goal not found" });
        return;
      }

      const topics: any[] = goal.learningTopics ?? [];

      // Guard: actively running (pipeline says so)
      const pipelineRunning = goal.pipelineRun?.status === "running";
      const anyInProgress = topics.some(
        (t) => t.structured?.decompositionStatus === "in_progress",
      );

      if (anyInProgress && pipelineRunning) {
        res.status(409).json({ error: "Decomposition is already running" });
        return;
      }

      // Reset stale in_progress → pending (server crashed mid-run)
      if (anyInProgress && !pipelineRunning) {
        for (const t of topics.filter(
          (t: any) => t.structured?.decompositionStatus === "in_progress",
        )) {
          await db
            .collection("goals")
            .updateOne(
              { _id: id, "learningTopics._id": t._id },
              {
                $set: {
                  "learningTopics.$.structured.decompositionStatus": "pending",
                },
              },
            );
        }
      }

      // Reload topics after reset
      const updatedGoal = await db
        .collection("goals")
        .findOne({ _id: id, userId });
      const updatedTopics: any[] = updatedGoal?.learningTopics ?? [];

      // Guard: nothing to retry
      const failedTopics = updatedTopics.filter(
        (t) => t.structured?.decompositionStatus === "failed",
      );
      if (failedTopics.length === 0) {
        res.status(400).json({ error: "No failed topics to retry" });
        return;
      }

      // Reset failed → pending
      for (const t of failedTopics) {
        await db
          .collection("goals")
          .updateOne(
            { _id: id, "learningTopics._id": t._id },
            {
              $set: {
                "learningTopics.$.structured.decompositionStatus": "pending",
              },
            },
          );
      }

      const failedTitles = failedTopics.map((t: any) => ({
        title: t.structured?.title ?? "",
        index: updatedTopics.indexOf(t),
      }));
      const steps = buildDecomposeSteps(failedTitles);
      const goalId = id.toString();
      await initPipelineRun(goalId, "decompose", steps);

      const { rows: profileRows } = await pool.query<{
        seniority_level: string;
      }>(
        "SELECT seniority_level FROM user_profiles_structured WHERE user_id = $1",
        [userId],
      );
      const seniorityLevel = profileRows[0]?.seniority_level ?? null;

      // Respond immediately — client polls GET /:id/pipeline for live step progress
      res.json({ accepted: true, pipelineStatus: "running" });

      // Background: decompose → finalize → email (resource enrichment runs via BullMQ automatically)
      void trackProductEvent({
        userId,
        goalId,
        eventKey: "decompose_started",
        properties: {
          retryMode: true,
          requestedTopicCount: failedTopics.length,
        },
      });
      void runDecompositionInBackground({
        userId,
        goalId,
        seniorityLevel,
        requestedTopicCount: failedTopics.length,
        retryMode: true,
        tracker: buildTrackerHooks(goalId),
        logLabel: "decompose/retry",
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/goals/:id/gaps/from-application — add a resume check's missing
// skills to this plan (skipping ones the plan already covers) and break the
// new ones into concepts.
router.post(
  "/:id/gaps/from-application",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const goalId = String(req.params.id);
      const applicationId = String(req.body?.applicationId ?? "");
      if (!ObjectId.isValid(goalId) || !/^[0-9a-f-]{36}$/i.test(applicationId)) {
        res.status(400).json({ error: "A goal id and an application id are required" });
        return;
      }
      const db = getDb();
      const goal = await db.collection("goals").findOne({ _id: new ObjectId(goalId), userId });
      if (!goal) {
        res.status(404).json({ error: "Goal not found" });
        return;
      }
      const application = await getResumeApplication(userId, applicationId);
      if (!application) {
        res.status(404).json({ error: "Resume check not found" });
        return;
      }
      const missing = application.gapReport?.missingSkills ?? [];
      if (missing.length === 0) {
        res.status(400).json({ error: "This resume check has no missing skills to add" });
        return;
      }

      const norm = (value: unknown) =>
        String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const gaps: any[] = Array.isArray(goal.skillGaps) ? [...goal.skillGaps] : [];
      const topics: any[] = Array.isArray(goal.learningTopics) ? [...goal.learningTopics] : [];
      const covered = (name: string) => {
        const n = norm(name);
        return gaps.some((gap) => {
          const area = norm(gap?.structured?.skillArea);
          return Boolean(n) && Boolean(area) && (area.includes(n) || n.includes(area));
        });
      };

      const added: string[] = [];
      const skipped: string[] = [];
      let nextPriority = gaps.reduce(
        (max, gap) => Math.max(max, Number(gap?.structured?.priority) || 0),
        0,
      );
      const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
      const ordered = [...missing].sort(
        (a, b) => (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1),
      );
      for (const skill of ordered.slice(0, 5)) {
        if (covered(skill.name)) {
          skipped.push(skill.name);
          continue;
        }
        nextPriority += 1;
        const gapId = new ObjectId();
        gaps.push({
          _id: gapId,
          raw: null,
          userConfirmed: true,
          structured: {
            skillArea: skill.name,
            skillCategory: "engineering",
            currentLevel: "aware",
            requiredLevel: "proficient",
            priority: nextPriority,
            priorityReason: skill.reason,
            identifiedBy: "resume_parse",
            status: "open",
            sourceApplicationId: applicationId,
          },
        });
        topics.push({
          _id: new ObjectId(),
          skillGapId: gapId,
          raw: null,
          createdAt: new Date(),
          completedAt: null,
          structured: {
            title: skill.name,
            skillGapArea: skill.name,
            rationale: skill.reason,
            estimatedWeeks: 1,
            priority: nextPriority,
            decompositionStatus: "pending",
            decompositionAttempts: 0,
            status: "pending",
            position: topics.length + 1,
            actualWeeks: null,
          },
        });
        added.push(skill.name);
      }

      if (added.length > 0) {
        await db.collection("goals").updateOne(
          { _id: goal._id, userId },
          { $set: { skillGaps: gaps, learningTopics: topics, updatedAt: new Date() } },
        );
      }
      await linkResumeApplicationGoal(userId, applicationId, goalId);

      const mapBuilt = topics.some(
        (topic) => topic?.structured?.decompositionStatus === "completed",
      );
      let building = false;
      if (added.length > 0 && goal.status === "active" && mapBuilt) {
        const { rows: profileRows } = await pool.query<{ seniority_level: string }>(
          "SELECT seniority_level FROM user_profiles_structured WHERE user_id = $1",
          [userId],
        );
        const newTopics = topics
          .map((topic, index) => ({ topic, index }))
          .filter(({ topic }) => topic?.structured?.decompositionStatus === "pending");
        await initPipelineRun(
          goalId,
          "decompose",
          buildDecomposeSteps(
            newTopics.map(({ topic, index }) => ({ title: topic.structured.title, index })),
          ),
        );
        building = true;
        void runDecompositionInBackground({
          userId,
          goalId,
          seniorityLevel: profileRows[0]?.seniority_level ?? null,
          requestedTopicCount: newTopics.length,
          retryMode: false,
          tracker: buildTrackerHooks(goalId),
          logLabel: "gaps/from-application",
        });
      }

      void trackProductEvent({
        userId,
        goalId,
        eventKey: "resume_gaps_added_to_plan",
        properties: { applicationId, added: added.length, skipped: skipped.length },
      });
      res.json({ added, skipped, building });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/goals/:id/recovery/apply — one-click fixes from the weekly check-in.
router.post(
  "/:id/recovery/apply",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const goalId = String(req.params.id);
      if (!ObjectId.isValid(goalId)) {
        res.status(400).json({ error: "Invalid goal id" });
        return;
      }
      const body = req.body ?? {};
      let change: RecoveryAction;
      if (body.action === "move_date" && Number(body.weeks) > 0) {
        change = { action: "move_date", weeks: Number(body.weeks) };
      } else if (body.action === "reduce_hours" && Number(body.hours) > 0) {
        change = { action: "reduce_hours", hours: Number(body.hours) };
      } else if (body.action === "focus_gap" && typeof body.gapId === "string") {
        change = { action: "focus_gap", gapId: body.gapId };
      } else {
        res.status(400).json({ error: "Choose move_date (weeks), reduce_hours (hours) or focus_gap (gapId)" });
        return;
      }
      const result = await applyRecoveryAction(userId, goalId, change);
      void trackProductEvent({
        userId,
        goalId,
        eventKey: "recovery_action_applied",
        properties: { action: change.action },
      });
      res.json(result);
    } catch (err: any) {
      if (err?.message === "Gap not found" || err?.message?.startsWith("This plan has no")) {
        res.status(400).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

// GET /api/goals/:id/nodes — return all concept nodes for a goal
router.get(
  "/:id/nodes",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;

      let id: ObjectId;
      try {
        id = new ObjectId(String(req.params.id));
      } catch {
        res.status(400).json({ error: "Invalid goal id" });
        return;
      }

      const nodes = await getGoalNodes(userId, id.toString());
      res.json(nodes);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/goals/:id/correct — user corrects something, re-derive the plan
router.post(
  "/:id/correct",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { correction } = req.body;
      if (!correction?.trim()) {
        res.status(400).json({ error: "correction text is required" });
        return;
      }

      let id: ObjectId;
      try {
        id = new ObjectId(String(req.params.id));
      } catch {
        res.status(400).json({ error: "Invalid goal id" });
        return;
      }

      const goalId = id.toString();
      const db = getDb();
      const goal = await db.collection("goals").findOne({ _id: id, userId });
      if (!goal) {
        res.status(404).json({ error: "Goal not found" });
        return;
      }

      // Save correction to goal-scoped corrections
      await saveGoalCorrection(goalId, userId, {
        correctionText: correction.trim(),
      });

      // Fetch goal-scoped inputs and corrections
      const inputs = await getGoalInputs(goalId, userId);
      const corrections = await getGoalCorrections(goalId, userId);

      // Combine inputs with corrections for context
      const allInputsForContext = [...inputs];
      if (corrections.length > 0) {
        allInputsForContext.push({
          type: "text" as const,
          source: "correction" as const,
          content: corrections.map((c) => c.correctionText).join("\n\n"),
          capturedAt: new Date(),
        });
      }

      const profile = await extractProfile(allInputsForContext);
      const goalClassification = await classifyGoal(
        allInputsForContext,
        profile,
      );
      const skillGaps = await analyzeSkillGaps(
        allInputsForContext,
        profile,
        goalClassification,
      );
      const learningTopics = await mapLearningTopics(
        skillGaps,
        profile,
        goalClassification,
      );
      const timeline = calculateTimeline(
        learningTopics,
        profile.availableMinsDay,
      );

      await updateGoalWithPlan(
        goalId,
        skillGaps,
        learningTopics,
        timeline,
        goalClassification,
      );
      await rebaselineGoalSprint(userId, goalId);

      const updated = await db.collection("goals").findOne({ _id: id, userId });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/goals/:id/resources — all resources for a goal, keyed by DP node UUID
router.get(
  "/:id/resources",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const goalId = String(req.params.id);

      const { rows: nodeRows } = await pool.query<{
        id: string;
        te_node_slug: string;
        learning_topic_id: string;
      }>(
        `SELECT id, te_node_slug, learning_topic_id
       FROM concept_nodes
       WHERE goal_id = $1 AND user_id = $2 AND te_node_slug IS NOT NULL`,
        [goalId, userId],
      );

      if (nodeRows.length === 0) {
        res.json({});
        return;
      }

      const db = getDb();
      const goal = await db
        .collection("goals")
        .findOne(
          { _id: new ObjectId(goalId), userId },
          { projection: { learningTopics: 1 } },
        );
      if (!goal) {
        res.status(404).json({ error: "Goal not found" });
        return;
      }

      const topicEngineMap: Record<string, string> = {};
      for (const t of goal.learningTopics as any[]) {
        if (t._id && t.structured?.topicEngineId) {
          topicEngineMap[t._id.toString()] = t.structured.topicEngineId;
        }
      }

      const uniqueTeIds = [
        ...new Set(
          nodeRows
            .map((n) => topicEngineMap[n.learning_topic_id])
            .filter(Boolean),
        ),
      ];

      const teResourcesBySlug: Record<string, Record<string, any>> = {};
      await Promise.all(
        uniqueTeIds.map(async (teId) => {
          try {
            const r = await axios.get(
              `${config.app.topicEngineUrl}/topics/${teId}/resources`,
              { timeout: 10_000 },
            );
            teResourcesBySlug[teId] = r.data;
          } catch {
            teResourcesBySlug[teId] = {};
          }
        }),
      );

      const result: Record<string, any[]> = {};
      for (const node of nodeRows) {
        const teId = topicEngineMap[node.learning_topic_id];
        if (!teId) continue;
        const bySlug = teResourcesBySlug[teId] ?? {};
        const entry = bySlug[node.te_node_slug];
        if (entry?.resources?.length) {
          result[node.id] = entry.resources;
        }
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/goals/:id/nodes/:nodeId/resources — resources for a single node (Today session)
router.get(
  "/:id/nodes/:nodeId/resources",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const goalId = String(req.params.id);
      const nodeId = String(req.params.nodeId);

      const { rows } = await pool.query<{
        te_node_slug: string;
        learning_topic_id: string;
      }>(
        `SELECT te_node_slug, learning_topic_id
       FROM concept_nodes WHERE id = $1 AND goal_id = $2 AND user_id = $3`,
        [nodeId, goalId, userId],
      );
      if (!rows.length || !rows[0].te_node_slug) {
        res.json([]);
        return;
      }

      const { te_node_slug, learning_topic_id } = rows[0];

      const db = getDb();
      const goal = await db
        .collection("goals")
        .findOne(
          { _id: new ObjectId(goalId), userId },
          { projection: { learningTopics: 1 } },
        );
      const topicDoc = (goal?.learningTopics as any[])?.find(
        (t: any) => t._id?.toString() === learning_topic_id,
      );
      const teId = topicDoc?.structured?.topicEngineId;
      if (!teId) {
        res.json([]);
        return;
      }

      const r = await axios.get(
        `${config.app.topicEngineUrl}/topics/${teId}/resources`,
        { timeout: 10_000 },
      );
      const entry = (r.data as Record<string, any>)[te_node_slug];
      res.json(entry?.resources ?? []);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/goals/:id/resources/retry — re-enqueue resource discovery for all completed topics
router.post(
  "/:id/resources/retry",
  requireAuth,
  requireEntitlement("premium_resources.enabled"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const goalId = String(req.params.id);

      const db = getDb();
      const goal = await db
        .collection("goals")
        .findOne(
          { _id: new ObjectId(goalId), userId },
          { projection: { learningTopics: 1, pipelineRun: 1 } },
        );
      if (!goal) {
        res.status(404).json({ error: "Goal not found" });
        return;
      }

      const allTopics: any[] = goal.learningTopics ?? [];
      const completedTopics = allTopics.filter(
        (t: any) => t.structured?.decompositionStatus === "completed",
      );
      if (completedTopics.length === 0) {
        res.status(400).json({ error: "No decomposed topics found" });
        return;
      }

      // Respond 202 immediately — all TE work happens in the background
      res.status(202).json({ started: true });

      // ── Background: enqueue resource discovery for all completed topics ──
      (async () => {
        const db2 = getDb();

        const goalDoc = await db2
          .collection("goals")
          .findOne(
            { _id: new ObjectId(goalId), userId },
            { projection: { learningTopics: 1 } },
          );
        if (!goalDoc) return;

        const enrichableTopics: Array<{
          stepId: string;
          topicEngineId: string;
        }> = [];

        for (let i = 0; i < completedTopics.length; i++) {
          const topicDoc = completedTopics[i];
          const teId: string = topicDoc.structured.topicEngineId;
          if (!teId || teId === 'null') {
            console.warn(`[resources/retry] Topic ${i} has no topicEngineId — skipping`);
            continue;
          }

          try {
            await axios.post(
              `${config.app.topicEngineUrl}/topics/${teId}/resources/enqueue`,
              {},
              { timeout: 10_000 },
            );
            enrichableTopics.push({
              stepId: `resource_enrichment_${i}`,
              topicEngineId: teId,
            });
          } catch (err) {
            console.warn(
              `[resources/retry] Failed to enqueue topic ${teId}:`,
              (err as Error).message,
            );
          }
        }

        if (enrichableTopics.length === 0) {
          console.warn(
            "[resources/retry] No topics were successfully enqueued",
          );
          return;
        }
        // BullMQ workers handle the actual discovery — nothing more to do here
      })().catch((err) =>
        console.error("[resources/retry] background error:", err),
      );
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/goals/:id/resources/coverage — per-node coverage status across all decomposed topics
router.get(
  "/:id/resources/coverage",
  requireAuth,
  requireEntitlement("premium_resources.enabled"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const goalId = String(req.params.id);

      const db = getDb();
      const goal = await db
        .collection("goals")
        .findOne(
          { _id: new ObjectId(goalId), userId },
          { projection: { learningTopics: 1 } },
        );
      if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }

      const completedTopics: string[] = (goal.learningTopics ?? [])
        .filter((t: any) => t.structured?.decompositionStatus === "completed" && t.structured?.topicEngineId)
        .map((t: any) => t.structured.topicEngineId as string);

      if (completedTopics.length === 0) {
        res.json({ total: 0, coveredCount: 0, weakCount: 0, uncoveredCount: 0, coveragePct: 0, nodes: [] });
        return;
      }

      const results = await Promise.allSettled(
        completedTopics.map((teId) =>
          axios.get(`${config.app.topicEngineUrl}/topics/${teId}/resources/coverage`, { timeout: 10_000 })
            .then((r) => r.data),
        ),
      );

      // Aggregate across all topics
      let total = 0, coveredCount = 0, weakCount = 0, uncoveredCount = 0;
      const nodes: any[] = [];
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        const d = result.value;
        total        += d.total;
        coveredCount += d.coveredCount;
        weakCount    += d.weakCount;
        uncoveredCount += d.uncoveredCount;
        nodes.push(...(d.nodes ?? []));
      }

      res.json({
        total,
        coveredCount,
        weakCount,
        uncoveredCount,
        coveragePct: total > 0 ? Math.round((coveredCount / total) * 100) : 0,
        nodes,
      });
    } catch (err) { next(err); }
  },
);

// POST /api/goals/:id/resources/fill-gaps — trigger gap-fill for all decomposed topics
router.post(
  "/:id/resources/fill-gaps",
  requireAuth,
  requireEntitlement("premium_resources.enabled"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const goalId = String(req.params.id);

      const db = getDb();
      const goal = await db
        .collection("goals")
        .findOne(
          { _id: new ObjectId(goalId), userId },
          { projection: { learningTopics: 1 } },
        );
      if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }

      const completedTopics: string[] = (goal.learningTopics ?? [])
        .filter((t: any) => t.structured?.decompositionStatus === "completed" && t.structured?.topicEngineId)
        .map((t: any) => t.structured.topicEngineId as string);

      if (completedTopics.length === 0) {
        res.status(400).json({ error: "No decomposed topics found" });
        return;
      }

      // Respond immediately — gap-fill runs in the background via BullMQ
      res.status(202).json({ started: true, topics: completedTopics.length });

      Promise.allSettled(
        completedTopics.map((teId) =>
          axios.post(
            `${config.app.topicEngineUrl}/topics/${teId}/resources/fill-gaps`,
            {},
            { timeout: 10_000 },
          ),
        ),
      ).catch((err: Error) =>
        console.error("[fill-gaps] background error:", err.message),
      );
    } catch (err) { next(err); }
  },
);

// POST /api/goals/:id/make-primary — promote this goal to primary (demotes the current one)
router.post(
  "/:id/make-primary",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      let id: ObjectId;
      try { id = new ObjectId(String(req.params.id)); }
      catch { res.status(400).json({ error: "Invalid goal id" }); return; }

      const db = getDb();
      const goal = await db.collection("goals").findOne({ _id: id, userId });
      if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }
      if (goal.status === "archived") {
        res.status(400).json({ error: "Cannot make an archived goal primary" }); return;
      }

      await db.collection("goals").updateMany({ userId, isPrimary: true }, { $set: { isPrimary: false } });
      await db.collection("goals").updateOne({ _id: id }, { $set: { isPrimary: true, updatedAt: new Date() } });
      res.json({ ok: true });
    } catch (err) { next(err); }
  },
);

// POST /api/goals/:id/archive — soft-archive a goal (stops it from driving Today/SR)
router.post(
  "/:id/archive",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      let id: ObjectId;
      try { id = new ObjectId(String(req.params.id)); }
      catch { res.status(400).json({ error: "Invalid goal id" }); return; }

      const db = getDb();
      const goal = await db.collection("goals").findOne({ _id: id, userId });
      if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }

      await db.collection("goals").updateOne(
        { _id: id },
        { $set: { status: "archived", isPrimary: false, updatedAt: new Date() } },
      );
      res.json({ ok: true });
    } catch (err) { next(err); }
  },
);

// DELETE /api/goals/:id — permanently delete a goal and all its data
router.delete(
  "/:id",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      let id: ObjectId;
      try { id = new ObjectId(String(req.params.id)); }
      catch { res.status(400).json({ error: "Invalid goal id" }); return; }

      const goalId = id.toString();
      const db = getDb();
      const goal = await db.collection("goals").findOne({ _id: id, userId });
      if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }

      // Delete everything that belongs to this goal. Concept nodes cascade to
      // edges, sessions, reviews, work and news; the rest is keyed by goal id.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "DELETE FROM concept_nodes WHERE goal_id = $1 AND user_id = $2",
          [goalId, userId],
        );
        for (const table of [
          "goal_sprints",
          "mock_interview_runs",
          "weekly_checkins",
          "weekly_summary_deliveries",
          "gap_events",
        ]) {
          await client.query(
            `DELETE FROM ${table} WHERE goal_id = $1 AND user_id = $2`,
            [goalId, userId],
          );
        }
        // Keep roles, plans and applications, but drop the link to this goal.
        for (const table of [
          "candidate_target_roles",
          "candidate_upgrade_plans",
          "resume_applications",
        ]) {
          await client.query(
            `UPDATE ${table} SET linked_goal_id = NULL WHERE linked_goal_id = $1 AND user_id = $2`,
            [goalId, userId],
          );
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      // Delete MongoDB documents
      await Promise.all([
        db.collection("goals").deleteOne({ _id: id }),
        db.collection("goal_raw_inputs").deleteMany({ goalId, userId }),
        db.collection("goal_corrections").deleteMany({ goalId, userId }),
      ]);

      res.json({ ok: true });
    } catch (err) { next(err); }
  },
);

// GET /api/goals/:id/suggest-next — suggest next goals after completing this one
router.get(
  "/:id/suggest-next",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const goalId = String(req.params.id);
      const suggestions = await suggestNextGoals(userId, goalId);
      res.json(suggestions);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
