import axios from "axios";
import { Router, Request, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { getDb } from "../db/mongo";
import { pool } from "../db/postgres";
import {
  saveGoalInput,
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
import {
  generateReflectionPrompt,
  isReflectionDue,
  saveReflection,
} from "../services/reflections";
import { suggestNextGoals } from "../services/similarity";
import { config } from "../config";
import {
  buildDecomposeSteps,
  initPipelineRun,
  setStepStatus,
  finalizePipelineRun,
  getPipelineRun,
} from "../services/pipelineTracker";
import { sendPipelineCompleteEmail } from "../services/emailService";

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
      const goal = await db
        .collection("goals")
        .findOne({ userId, isPrimary: true });
      if (!goal) {
        res.status(404).json({ error: "No primary goal found" });
        return;
      }
      res.json(goal);
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
      res.json(goal);
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
        updatedAt: new Date(),
      };
      if (availableMinsDay)
        update["structured.estimatedWeeks"] = availableMinsDay;

      await db.collection("goals").updateOne({ _id: id }, { $set: update });
      res.json({ confirmed: true });
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
        .filter((t: any) => t.structured?.decompositionStatus !== "completed")
        .map((t: any) => ({ title: t.structured?.title ?? "" }));

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
      decomposeGoal(userId, goalId, seniorityLevel, buildTrackerHooks(goalId))
        .then((result) =>
          finalizePipelineRun(goalId).then(() =>
            sendPipelineCompleteEmail(userId, goalId, result),
          ),
        )
        .catch((err) =>
          console.error("[decompose] background pipeline error:", err),
        );
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
      decomposeGoal(userId, goalId, seniorityLevel, buildTrackerHooks(goalId))
        .then((result) =>
          finalizePipelineRun(goalId).then(() =>
            sendPipelineCompleteEmail(userId, goalId, result),
          ),
        )
        .catch((err) =>
          console.error("[decompose/retry] background pipeline error:", err),
        );
    } catch (err) {
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

      const updated = await db.collection("goals").findOne({ _id: id, userId });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/goals/:id/reflection/prompt — get this week's reflection question
router.get(
  "/:id/reflection/prompt",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const goalId = String(req.params.id);
      const due = await isReflectionDue(goalId);
      if (!due) {
        res.json({ due: false, prompt: null });
        return;
      }
      const prompt = await generateReflectionPrompt(goalId);
      res.json({ due: true, prompt });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/goals/:id/reflection — save a reflection response
router.post(
  "/:id/reflection",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const goalId = String(req.params.id);
      const { answer, promptQuestion, momentumRating, relevanceRating } =
        req.body;
      if (!answer?.trim()) {
        res.status(400).json({ error: "answer is required" });
        return;
      }

      await saveReflection(goalId, userId, {
        promptQuestion: promptQuestion ?? "",
        answer: answer.trim(),
        momentumRating: momentumRating ?? undefined,
        relevanceRating: relevanceRating ?? undefined,
      });
      res.json({ saved: true });
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

      // Delete PostgreSQL rows first (cascades to edges, sessions, SR queue, news_items)
      await pool.query(
        "DELETE FROM concept_nodes WHERE goal_id = $1 AND user_id = $2",
        [goalId, userId],
      );

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
