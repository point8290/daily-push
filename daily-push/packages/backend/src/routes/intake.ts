import { Router, Request, Response, NextFunction } from "express";
import { requireAuth, AuthRequest } from "../middleware/auth";
import {
  saveGoalInput,
  getGoalInputs,
  getGoalCorrections,
  generateClarifyingQuestions,
  extractProfile,
  classifyGoal,
  saveProfile,
  analyzeSkillGaps,
  mapLearningTopics,
  calculateTimeline,
  updateGoalWithPlan,
} from "../services/intake";
import {
  matchGoalProfile,
  routeDecision,
  inferSkillGaps,
  inferLearningTopics,
  estimateTimelineFromProfile,
  learnFromLLMResult,
} from "../services/decisionLayer";
import {
  buildIntakeSteps,
  initPipelineRun,
  setStepStatus,
  finalizePipelineRun,
} from "../services/pipelineTracker";
import { getDb } from "../db/mongo";

const router = Router();

// POST /api/intake/start — create temporary goal and return goalId
router.post(
  "/start",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const db = getDb();

      const now = new Date();
      const doc = {
        userId,
        raw: {
          input: "",
          capturedAt: now,
          source: "goal_intake",
        },
        structured: {},
        skillGaps: [],
        learningTopics: [],
        milestones: [],
        adjustments: [],
        reflections: [],
        status: "intake_in_progress",
        stage: "intake",
        isPrimary: true,
        createdAt: now,
        updatedAt: now,
        achievedAt: null,
        abandonedAt: null,
        abandonedReason: null,
      };

      // Mark any existing primary goals as non-primary
      await db
        .collection("goals")
        .updateMany(
          { userId, isPrimary: true },
          { $set: { isPrimary: false } },
        );

      const result = await db.collection("goals").insertOne(doc);
      const goalId = result.insertedId.toString();

      res.status(201).json({ goalId });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/intake/raw — save one raw input verbatim
router.post(
  "/raw",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { goalId, content, source = "goal_intake" } = req.body;

      if (!goalId?.trim()) {
        res.status(400).json({ error: "goalId is required" });
        return;
      }

      if (!content?.trim()) {
        res.status(400).json({ error: "content is required" });
        return;
      }

      const saved = await saveGoalInput(goalId, userId, {
        type: source === "clarification" ? "form_answer" : "text",
        source,
        content: content.trim(),
      });

      res.status(201).json({ saved: true, capturedAt: saved.capturedAt });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/intake/clarify — generate clarifying questions based on goal inputs
router.post(
  "/clarify",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { goalId } = req.body;

      if (!goalId?.trim()) {
        res.status(400).json({ error: "goalId is required" });
        return;
      }

      const inputs = await getGoalInputs(goalId, userId);
      if (inputs.length === 0) {
        res
          .status(400)
          .json({
            error:
              "No raw inputs found for this goal. Save your goal text first.",
          });
        return;
      }

      const questions = await generateClarifyingQuestions(inputs);
      res.json({ questions });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/intake/process — full pipeline: profile → classify → gaps → topics → timeline
// Routes through Decision Layer first — LLM only when knowledge layer confidence is low
router.post(
  "/process",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    // Track current step for error handler
    let currentStepId = "decision_routing";
    let goalId: string | null = null;

    // Phase A: build steps in-memory (goalId already available)
    const steps = buildIntakeSteps();
    const setInMemory = (id: string, status: "running" | "done") => {
      const step = steps.find((s) => s.id === id);
      if (!step) return;
      step.status = status;
      if (status === "running") step.startedAt = new Date();
      if (status === "done") step.completedAt = new Date();
    };

    try {
      const { userId } = req as AuthRequest;
      const { goalId: providedGoalId } = req.body;

      if (!providedGoalId?.trim()) {
        res.status(400).json({ error: "goalId is required" });
        return;
      }

      goalId = providedGoalId;

      // Fetch goal-scoped inputs and corrections
      const inputs = await getGoalInputs(goalId, userId);
      const corrections = await getGoalCorrections(goalId, userId);

      if (inputs.length === 0) {
        res
          .status(400)
          .json({
            error:
              "No raw inputs found for this goal. Save your goal text first.",
          });
        return;
      }

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

      const rawGoalText = inputs
        .filter((i) => i.source === "goal_intake")
        .map((i) => i.content)
        .join(" ");

      // ── Phase A: steps tracked in-memory ─────────────────

      // decision_routing
      setInMemory("decision_routing", "running");
      currentStepId = "decision_routing";
      const match = await matchGoalProfile(rawGoalText);
      const route = routeDecision(match);
      setInMemory("decision_routing", "done");

      // profile_extraction
      setInMemory("profile_extraction", "running");
      currentStepId = "profile_extraction";
      const profile = await extractProfile(allInputsForContext);
      await saveProfile(userId, profile, []);
      setInMemory("profile_extraction", "done");

      // goal_classification
      setInMemory("goal_classification", "running");
      currentStepId = "goal_classification";
      let goalClassification;
      if (route.action !== "llm" && match.profile) {
        goalClassification = {
          title: match.profile.title,
          goalType: match.profile.goalType,
          timeHorizon: "medium_term" as const,
          urgency: "planning" as const,
          emotionalDriver: "growth" as const,
          statedWhy: rawGoalText.slice(0, 200),
          successCriteria: match.profile.typicalSkillGaps
            .map((g) => g.skillArea)
            .join(", "),
          targetDate: null,
          targetDateFlexibility: "flexible" as const,
          confidenceLevel: Math.round(match.confidence * 5),
        };
      } else {
        goalClassification = await classifyGoal(allInputsForContext, profile);
      }
      setInMemory("goal_classification", "done");

      // Update goalId in MongoDB with initial classification (if not already done)
      await initPipelineRun(goalId, "intake", steps); // Phase B begins

      // ── Phase B: all remaining updates go directly to MongoDB ─────────────────

      // skill_gap_analysis
      currentStepId = "skill_gap_analysis";
      await setStepStatus(goalId, "skill_gap_analysis", "running");
      let skillGaps;
      let learningTopics;

      if (route.action === "direct" && match.profile) {
        skillGaps = inferSkillGaps(match.profile, profile.primaryStack);
      } else if (
        (route.action === "confirm" || route.action === "clarify") &&
        match.profile
      ) {
        const seedGaps = inferSkillGaps(match.profile, profile.primaryStack);
        skillGaps = await analyzeSkillGaps(
          allInputsForContext,
          profile,
          goalClassification,
        );
        if (skillGaps.length < seedGaps.length / 2) {
          skillGaps = [...skillGaps, ...seedGaps.slice(skillGaps.length)];
        }
      } else {
        skillGaps = await analyzeSkillGaps(
          allInputsForContext,
          profile,
          goalClassification,
        );
      }
      await setStepStatus(goalId, "skill_gap_analysis", "done");

      // topic_mapping
      currentStepId = "topic_mapping";
      await setStepStatus(goalId, "topic_mapping", "running");
      if (route.action === "direct" && match.profile) {
        learningTopics = inferLearningTopics(match.profile, skillGaps);
      } else {
        learningTopics = await mapLearningTopics(
          skillGaps,
          profile,
          goalClassification,
        );
      }
      await setStepStatus(goalId, "topic_mapping", "done");

      // timeline_estimation
      currentStepId = "timeline_estimation";
      await setStepStatus(goalId, "timeline_estimation", "running");
      const minsPerDay = profile.availableMinsDay ?? 45;
      let timeline;
      if (route.action === "direct" && match.profile) {
        const weeks = estimateTimelineFromProfile(match.profile, minsPerDay);
        timeline = {
          estimatedWeeks: weeks,
          estimatedWeeksAtPace: weeks,
          availableMinsDay: minsPerDay,
        };
      } else {
        timeline = calculateTimeline(learningTopics, profile.availableMinsDay);
      }
      await updateGoalWithPlan(
        goalId,
        skillGaps,
        learningTopics,
        timeline,
        goalClassification,
      );
      await setStepStatus(goalId, "timeline_estimation", "done");
      await finalizePipelineRun(goalId);

      // Write LLM results back to knowledge layer (non-blocking)
      if (route.action === "llm") {
        learnFromLLMResult(
          rawGoalText,
          match.matchedSignals,
          skillGaps,
          learningTopics,
          goalClassification.goalType,
          minsPerDay,
          timeline.estimatedWeeksAtPace,
        ).catch(() => {});
      }

      res.status(201).json({
        goalId,
        profile,
        skillGaps,
        learningTopics,
        timeline,
        _meta: { decisionRoute: route.action, confidence: match.confidence },
      });
    } catch (err) {
      // Mark current step failed if we have a goalId
      if (goalId) {
        setStepStatus(
          goalId,
          currentStepId,
          "failed",
          (err as Error).message,
        ).catch(() => {});
        finalizePipelineRun(goalId).catch(() => {});
      }
      next(err);
    }
  },
);

export default router;
