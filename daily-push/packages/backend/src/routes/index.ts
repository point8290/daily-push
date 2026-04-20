import { Router } from 'express';
import authRouter from './auth';
import intakeRouter from './intake';
import goalsRouter from './goals';
import todayRouter from './today';
import sessionsRouter from './sessions';
import settingsRouter from './settings';

import newsRouter from './news';

const router = Router();

router.use('/auth', authRouter);
router.use('/intake', intakeRouter);
router.use('/goals', goalsRouter);
router.use('/today', todayRouter);
router.use('/sessions', sessionsRouter);
router.use('/settings', settingsRouter);
router.use('/news', newsRouter);

export default router;
