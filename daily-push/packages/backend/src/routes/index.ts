import { Router } from 'express';
import topicsRouter from './topics';
import studyItemsRouter from './studyItems';
import sessionsRouter from './sessions';
import newsRouter from './news';
import digestRouter from './digest';
import settingsRouter from './settings';
import categoriesRouter from './categories';
import subcategoriesRouter from './subcategories';

const router = Router();

router.use('/categories', categoriesRouter);
router.use('/subcategories', subcategoriesRouter);
router.use('/topics', topicsRouter);
router.use('/study-items', studyItemsRouter);
router.use('/sessions', sessionsRouter);
router.use('/news', newsRouter);
router.use('/digest', digestRouter);
router.use('/settings', settingsRouter);

export default router;
