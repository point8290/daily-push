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
  generateGlobalTailoredResume,
  generateResumeApplicationTailoredResume,
  getGlobalResumeRecord,
  getResumeApplication,
  linkResumeApplicationGoal,
  listResumeApplications,
  rebuildGlobalGapReport,
  saveGlobalJobDescription,
  saveGlobalResume,
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
    adjustments: [],
    reflections: [],
    sprint: null,
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

router.get(
  "/workspace",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      res.json(await getGlobalResumeRecord(userId));
    } catch (err) {
      next(err);
    }
  },
);

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

router.post(
  "/resume",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const body = assertBodyObject(req.body);
      const rawText = readRequiredString(body.rawText, "rawText", {
        minLength: 10,
        maxLength: 40000,
      });
      const source =
        body.source === undefined
          ? "manual"
          : readEnumValue(body.source, "source", [
              "manual",
              "upload",
              "linkedin_paste",
            ] as const);

      const result = await saveGlobalResume(userId, rawText, source);
      void trackProductEvent({
        userId,
        eventKey: "global_resume_saved",
        properties: {
          source,
          skillCount: result.resumeSummary.coreSkills.length,
          evidenceCount: result.resumeSummary.evidenceAreas.length,
        },
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/job-description",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const body = assertBodyObject(req.body);
      const jdText = readRequiredString(body.jdText, "jdText", {
        minLength: 20,
        maxLength: 50000,
      });
      const targetRole = readOptionalString(body.targetRole, "targetRole", {
        maxLength: 160,
      });
      const targetCompany = readOptionalString(
        body.targetCompany,
        "targetCompany",
        { maxLength: 160 },
      );

      const result = await saveGlobalJobDescription(userId, {
        targetRole,
        targetCompany,
        jdText,
      });

      void trackProductEvent({
        userId,
        eventKey: "global_job_description_saved",
        properties: {
          targetRole: result.parsedJd.targetRole,
          mustHaveSkillCount: result.parsedJd.mustHaveSkills.length,
          evidenceSignalCount: result.parsedJd.evidenceSignals.length,
        },
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/gap-report/rebuild",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const entitlement = await consumeQuota(userId, "resume_reports.monthly", {
        source: "global_resume_gap_report",
      });

      const record = await rebuildGlobalGapReport(userId);

      void trackProductEvent({
        userId,
        eventKey: "global_gap_report_generated",
        properties: {
          readinessLabel: record.gapReport?.readinessLabel ?? null,
          missingSkillCount: record.gapReport?.missingSkills.length ?? 0,
          missingProofCount: record.gapReport?.missingProof.length ?? 0,
          remainingReports: entitlement.remaining,
        },
      });

      res.json({
        ...record,
        quota: {
          featureKey: "resume_reports.monthly",
          remaining: entitlement.remaining,
          limitValue: entitlement.limitValue,
        },
      });
    } catch (err: any) {
      if (
        err?.message === "Save a resume before generating a gap report." ||
        err?.message ===
          "Save a target job description before generating a gap report."
      ) {
        res.status(400).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

router.post(
  "/tailored-resume",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const entitlement = await consumeQuota(userId, "tailored_resumes.monthly", {
        source: "global_resume_tailored_resume",
      });
      const record = await generateGlobalTailoredResume(userId);

      void trackProductEvent({
        userId,
        eventKey: "global_tailored_resume_generated",
        properties: {
          targetRole: record.tailoredResume?.targetRole ?? null,
          skillCount: record.tailoredResume?.skills.length ?? 0,
          warningCount: record.tailoredResume?.missingEvidenceWarnings.length ?? 0,
        },
      });

      res.json({
        ...record,
        quota: {
          featureKey: "tailored_resumes.monthly",
          remaining: entitlement.remaining,
          limitValue: entitlement.limitValue,
        },
      });
    } catch (err: any) {
      if (
        err?.message === "Save a resume before generating a tailored resume." ||
        err?.message ===
          "Save a target job description before generating a tailored resume."
      ) {
        res.status(400).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

export default router;
