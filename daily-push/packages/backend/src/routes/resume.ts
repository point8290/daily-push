import { Router, Request, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { getDb } from "../db/mongo";
import { trackProductEvent } from "../services/productEvents";
import {
  assertBelowStateLimit,
  assertEntitlementEnabled,
  consumeQuota,
} from "../services/entitlements";
import {
  buildResumeFitSnapshot,
  createResumeApplication,
  generateResumeApplicationTailoredResume,
  getResumeApplication,
  linkResumeApplicationGoal,
  listResumeApplications,
  updateResumeApplicationStatus,
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from "../services/jobGapAnalysis";
import {
  saveGoalInput,
  updateGoalWithPlan,
  type ClassifiedGoal,
  type LearningTopic,
  type SkillGap,
} from "../services/intake";
import {
  rebaselineGoalSprint,
  saveGoalSprintDefinition,
} from "../services/sprintPlanner";
import {
  assertBodyObject,
  readEnumValue,
  readOptionalString,
  readRequiredString,
} from "../utils/requestValidation";

const router = Router();

function assertUuid(value: string, message = "Invalid resume application id"): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    const error = new Error(message);
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }
  return value;
}

function deriveGoalTitle(targetRole: string | null): string {
  return targetRole ? `Land a ${targetRole} role` : "Land the target role";
}

function buildGoalInputFromApplication(application: Awaited<ReturnType<typeof getResumeApplication>>): string {
  if (!application) return "";
  const gaps = application.gapReport?.missingSkills.map((item) => item.name).join(", ") || "role-specific gaps";
  const proof = application.gapReport?.missingProof.map((item) => item.area).join(", ") || "stronger proof";
  return [
    `I want to ${deriveGoalTitle(application.targetRole).toLowerCase()}.`,
    `This goal was created from a resume analysis for ${application.targetRole ?? "the target role"}.`,
    `Key capability gaps: ${gaps}.`,
    `Proof gaps to close: ${proof}.`,
    application.gapReport?.portfolioSuggestion
      ? `Suggested proof artifact: ${application.gapReport.portfolioSuggestion}.`
      : null,
  ].filter(Boolean).join("\n");
}

function buildGoalPlanFromApplication(application: NonNullable<Awaited<ReturnType<typeof getResumeApplication>>>): {
  classification: ClassifiedGoal;
  skillGaps: SkillGap[];
  learningTopics: LearningTopic[];
  timeline: { estimatedWeeks: number; estimatedWeeksAtPace: number; availableMinsDay: number };
} {
  const missingSkills = application.gapReport?.missingSkills ?? [];
  const missingProof = application.gapReport?.missingProof ?? [];
  const skillGaps: SkillGap[] = [
    ...missingSkills.map((item, index) => ({
      skillArea: item.name,
      skillCategory: "engineering" as const,
      currentLevel: "familiar" as const,
      requiredLevel: item.priority === "high" ? "proficient" as const : "familiar" as const,
      priority: index + 1,
      priorityReason: item.reason,
      longevity: item.priority === "low" ? "medium" as const : "high" as const,
      aiRelationship: "amplified" as const,
      identifiedBy: "resume_parse" as const,
    })),
    ...missingProof.slice(0, 3).map((item, index) => ({
      skillArea: item.area,
      skillCategory: "soft_skills" as const,
      currentLevel: "aware" as const,
      requiredLevel: "proficient" as const,
      priority: missingSkills.length + index + 1,
      priorityReason: item.reason,
      longevity: "high" as const,
      aiRelationship: "amplified" as const,
      identifiedBy: "resume_parse" as const,
    })),
  ].slice(0, 8);

  const learningTopics: LearningTopic[] = (skillGaps.length > 0 ? skillGaps : [{
    skillArea: application.targetRole ?? "Target role readiness",
    skillCategory: "engineering" as const,
    currentLevel: "familiar" as const,
    requiredLevel: "proficient" as const,
    priority: 1,
    priorityReason: "The resume analysis found role-readiness work to complete.",
    longevity: "high" as const,
    aiRelationship: "amplified" as const,
    identifiedBy: "resume_parse" as const,
  }]).map((gap, index) => ({
    title: `Build proof for ${gap.skillArea}`,
    skillGapArea: gap.skillArea,
    rationale: gap.priorityReason,
    estimatedWeeks: index < 2 ? 2 : 1,
    priority: index + 1,
  }));

  return {
    classification: {
      title: deriveGoalTitle(application.targetRole),
      goalType: "career",
      timeHorizon: "short_term",
      urgency: "planning",
      emotionalDriver: "growth",
      statedWhy: "Close the gaps found in the resume analysis and become a stronger applicant.",
      successCriteria: "A stronger targeted resume, clearer proof artifacts, and improved interview readiness for the target role.",
      targetDate: null,
      targetDateFlexibility: "flexible",
      confidenceLevel: Math.max(40, application.gapReport?.confidence ?? 60),
    },
    skillGaps,
    learningTopics,
    timeline: {
      estimatedWeeks: Math.max(4, Math.min(8, learningTopics.length + 3)),
      estimatedWeeksAtPace: Math.max(4, Math.min(8, learningTopics.length + 3)),
      availableMinsDay: 45,
    },
  };
}

async function createGoalFromApplication(userId: string, applicationId: string): Promise<string> {
  const application = await getResumeApplication(userId, applicationId);
  if (!application) {
    const error = new Error("Resume application not found");
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }
  if (application.linkedGoalId) {
    return application.linkedGoalId;
  }

  const db = getDb();
  const activeGoalCount = await db.collection("goals").countDocuments({
    userId,
    status: { $in: ["intake_in_progress", "active", "drafting", "assessing", "planning", "paused"] },
  });
  await assertBelowStateLimit(userId, "goals.active.max", activeGoalCount);

  await db.collection("goals").updateMany(
    { userId, isPrimary: true },
    { $set: { isPrimary: false } },
  );

  const now = new Date();
  const result = await db.collection("goals").insertOne({
    _id: new ObjectId(),
    userId,
    raw: {
      input: buildGoalInputFromApplication(application),
      capturedAt: now,
      source: "resume_analysis",
    },
    structured: {},
    skillGaps: [],
    learningTopics: [],
    milestones: [],
    status: "intake_in_progress",
    stage: "intake",
    isPrimary: true,
    createdAt: now,
    updatedAt: now,
    achievedAt: null,
    abandonedAt: null,
    abandonedReason: null,
  });
  const goalId = result.insertedId.toString();
  await saveGoalInput(goalId, userId, {
    type: "text",
    source: "goal_intake",
    content: buildGoalInputFromApplication(application),
  });
  const plan = buildGoalPlanFromApplication(application);
  await updateGoalWithPlan(
    goalId,
    plan.skillGaps,
    plan.learningTopics,
    plan.timeline,
    plan.classification,
  );
  await linkResumeApplicationGoal(userId, applicationId, goalId);
  return goalId;
}

router.post(
  "/preview",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = assertBodyObject(req.body);
      const rawText = readRequiredString(body.rawText, "rawText", {
        minLength: 10,
        maxLength: 40000,
      });
      const jdText = readRequiredString(body.jdText, "jdText", {
        minLength: 20,
        maxLength: 50000,
      });

      res.json(await buildResumeFitSnapshot({ rawText, jdText }));
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/applications",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      res.json(await listResumeApplications(userId));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/applications",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const body = assertBodyObject(req.body);
      const rawText = readRequiredString(body.rawText, "rawText", {
        minLength: 10,
        maxLength: 40000,
      });
      const jdText = readRequiredString(body.jdText, "jdText", {
        minLength: 20,
        maxLength: 50000,
      });
      const source =
        body.source === undefined
          ? "manual"
          : readEnumValue(body.source, "source", [
              "manual",
              "upload",
              "linkedin_paste",
            ] as const);
      const title = readOptionalString(body.title, "title", { maxLength: 255 });
      const targetRoleId = body.targetRoleId === undefined || body.targetRoleId === null
        ? null
        : assertUuid(
            readOptionalString(body.targetRoleId, "targetRoleId", { maxLength: 80 }) ?? "",
            "Invalid Target Role id",
          );

      const currentApplications = await listResumeApplications(userId);
      await assertBelowStateLimit(
        userId,
        "applications.saved.max",
        currentApplications.length,
      );
      const quota = await consumeQuota(userId, "resume_reports.monthly", {
        source: "resume_application_create",
      });
      const application = await createResumeApplication(userId, {
        rawText,
        jdText,
        source,
        title,
        targetRoleId,
      });

      void trackProductEvent({
        userId,
        eventKey: "resume_analysis_saved",
        properties: {
          applicationId: application.id,
          targetRoleId: application.targetRoleId,
          targetRole: application.targetRole,
          remainingReports: quota.remaining,
        },
      });

      res.status(201).json({
        application,
        quota: {
          featureKey: "resume_reports.monthly",
          remaining: quota.remaining,
          limitValue: quota.limitValue,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/applications/:id",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const application = await getResumeApplication(userId, assertUuid(String(req.params.id)));
      if (!application) {
        res.status(404).json({ error: "Resume application not found" });
        return;
      }
      res.json(application);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/resume/applications/:id/status — track where this application is.
// An offer on an application linked to a plan marks that plan achieved.
router.patch(
  "/applications/:id/status",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const body = assertBodyObject(req.body);
      const status = readEnumValue(
        body.status,
        "status",
        APPLICATION_STATUSES as unknown as readonly ApplicationStatus[],
      ) as ApplicationStatus | null;
      if (!status) {
        res.status(400).json({ error: "status is required" });
        return;
      }
      const applicationId = assertUuid(String(req.params.id));
      const application = await updateResumeApplicationStatus(userId, applicationId, status);
      if (!application) {
        res.status(404).json({ error: "Resume application not found" });
        return;
      }

      let planAchieved = false;
      if (status === "offer" && application.linkedGoalId && ObjectId.isValid(application.linkedGoalId)) {
        const result = await getDb().collection("goals").updateOne(
          {
            _id: new ObjectId(application.linkedGoalId),
            userId,
            status: { $ne: "achieved" },
          },
          { $set: { status: "achieved", achievedAt: new Date(), updatedAt: new Date() } },
        );
        planAchieved = result.modifiedCount > 0;
      }

      const eventKey =
        status === "offer"
          ? "offer_outcome_recorded"
          : status === "interviewing"
            ? "interview_outcome_recorded"
            : "application_outcome_recorded";
      void trackProductEvent({
        userId,
        goalId: application.linkedGoalId ?? null,
        eventKey,
        properties: {
          applicationId,
          outcome: status,
          targetRoleId: application.targetRoleId,
        },
      });

      res.json({ ...application, planAchieved });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/applications/:id/tailored-resume",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const applicationId = assertUuid(String(req.params.id));
      const quota = await consumeQuota(userId, "tailored_resumes.monthly", {
        source: "resume_application_tailored_resume",
      });
      const application = await generateResumeApplicationTailoredResume(userId, applicationId);

      res.json({
        application,
        quota: {
          featureKey: "tailored_resumes.monthly",
          remaining: quota.remaining,
          limitValue: quota.limitValue,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/applications/:id/create-goal",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const applicationId = assertUuid(String(req.params.id));
      const goalId = await createGoalFromApplication(userId, applicationId);

      void trackProductEvent({
        userId,
        goalId,
        eventKey: "resume_goal_created",
        properties: { applicationId },
      });

      res.status(201).json({ goalId });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/applications/:id/create-sprint",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const applicationId = assertUuid(String(req.params.id));
      await assertEntitlementEnabled(userId, "premium_sprints.enabled");
      const application = await getResumeApplication(userId, applicationId);
      if (!application) {
        res.status(404).json({ error: "Resume application not found" });
        return;
      }
      const goalId = await createGoalFromApplication(userId, applicationId);
      const blockers = [
        ...(application.gapReport?.missingSkills.map((item) => `${item.name}: ${item.reason}`) ?? []),
        ...(application.gapReport?.missingProof.map((item) => `${item.area}: ${item.evidenceNeeded}`) ?? []),
      ].slice(0, 8);
      const successEvidence = [
        application.gapReport?.portfolioSuggestion ?? null,
        ...(application.gapReport?.sprintEdits ?? []),
      ].filter((item): item is string => !!item).slice(0, 8);

      await saveGoalSprintDefinition(userId, goalId, {
        sprintType: "standard",
        targetRole: application.targetRole,
        targetCompany: application.targetCompany,
        targetDate: null,
        weeklyCommitmentHours: 6,
        currentBlockers: blockers,
        successEvidence,
      });
      const planHealth = await rebaselineGoalSprint(userId, goalId);
      await linkResumeApplicationGoal(userId, applicationId, goalId, true);

      void trackProductEvent({
        userId,
        goalId,
        eventKey: "resume_sprint_created",
        properties: {
          applicationId,
          targetRole: application.targetRole,
          blockerCount: blockers.length,
        },
      });

      res.status(201).json({ goalId, sprint: planHealth.sprint, planHealth });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
