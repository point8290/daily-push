import { Router, Request, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { config } from "../config";
import { getDb } from "../db/mongo";
import { trackProductEvent } from "../services/productEvents";
import { assertEntitlementEnabled, consumeQuota } from "../services/entitlements";
import {
  getGoalGapReportRecord,
  generateTailoredResume,
  rebuildGoalGapReport,
  saveGoalJobDescription,
  saveGoalRepoImport,
  saveGoalResume,
} from "../services/jobGapAnalysis";
import {
  assertBodyObject,
  readEnumValue,
  readHttpUrl,
  readOptionalString,
  readRequiredString,
} from "../utils/requestValidation";

const router = Router();

router.post(
  "/:id/resume",
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

      const result = await saveGoalResume(userId, id.toString(), rawText, source);
      void trackProductEvent({
        userId,
        goalId: id.toString(),
        eventKey: "goal_resume_saved",
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
  "/:id/repo-import",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      if (!config.career.gapReportRepoEvidenceEnabled) {
        res.status(404).json({ error: "Repository evidence is currently disabled for gap reports." });
        return;
      }

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

      await assertEntitlementEnabled(userId, "premium_sprints.enabled");

      const body = assertBodyObject(req.body);
      const repoUrl = readHttpUrl(body.repoUrl, "repoUrl");
      const repoContext = readOptionalString(body.repoContext, "repoContext", {
        maxLength: 4000,
      });

      const result = await saveGoalRepoImport(userId, id.toString(), {
        repoUrl,
        repoContext,
        targetRole: goal?.sprint?.targetRole ?? null,
        targetCompany: goal?.sprint?.targetCompany ?? null,
      });

      void trackProductEvent({
        userId,
        goalId: id.toString(),
        eventKey: "goal_repo_imported",
        properties: {
          repoUrl: result.repoSummary.repoUrl,
          source: result.repoSummary.source,
          demonstratedSkillCount: result.repoSummary.demonstratedSkills.length,
          evidenceSignalCount: result.repoSummary.evidenceSignals.length,
          confidence: result.repoSummary.confidence,
        },
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/:id/job-description",
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

      const result = await saveGoalJobDescription(userId, id.toString(), {
        targetRole: targetRole ?? goal?.sprint?.targetRole ?? null,
        targetCompany: targetCompany ?? goal?.sprint?.targetCompany ?? null,
        jdText,
      });

      void trackProductEvent({
        userId,
        goalId: id.toString(),
        eventKey: "goal_job_description_saved",
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

router.get(
  "/:id/gap-report",
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

      const record = await getGoalGapReportRecord(userId, id.toString());
      res.json(record);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/:id/gap-report/rebuild",
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

      const entitlement = await consumeQuota(userId, "gap_reports.monthly", {
        source: "job_gap_report",
        properties: {
          goalId: id.toString(),
        },
      });

      const record = await rebuildGoalGapReport(userId, id.toString());

      void trackProductEvent({
        userId,
        goalId: id.toString(),
        eventKey: "goal_gap_report_generated",
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
          featureKey: "gap_reports.monthly",
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
  "/:id/tailored-resume",
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

      await assertEntitlementEnabled(userId, "premium_sprints.enabled");
      const record = await generateTailoredResume(userId, id.toString());

      void trackProductEvent({
        userId,
        goalId: id.toString(),
        eventKey: "tailored_resume_generated",
        properties: {
          targetRole: record.tailoredResume?.targetRole ?? null,
          skillCount: record.tailoredResume?.skills.length ?? 0,
          warningCount: record.tailoredResume?.missingEvidenceWarnings.length ?? 0,
        },
      });

      res.json(record);
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
