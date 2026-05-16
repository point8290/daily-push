import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireEntitlement } from '../middleware/requireEntitlement';
import {
  buildGoalArtifactExport,
  buildGoalArtifactExportFilename,
  renderGoalArtifactExportMarkdown,
  type ArtifactExportFormat,
} from '../services/artifactExports';
import { trackProductEvent } from '../services/productEvents';

const router = Router();

router.get(
  '/:id/artifacts/export',
  requireAuth,
  requireEntitlement('artifacts.export.enabled'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const goalId = String(req.params.id);
      const format =
        req.query.format === 'json' ? 'json' : 'markdown';

      const payload = await buildGoalArtifactExport(userId, goalId);
      const filename = buildGoalArtifactExportFilename(
        payload,
        format as ArtifactExportFormat,
      );

      void trackProductEvent({
        userId,
        goalId,
        eventKey: 'artifact_exported',
        properties: {
          format,
          artifactCount: payload.artifactCount,
        },
      });

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(JSON.stringify(payload, null, 2));
        return;
      }

      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(renderGoalArtifactExportMarkdown(payload));
    } catch (err) {
      next(err);
    }
  },
);

export default router;
