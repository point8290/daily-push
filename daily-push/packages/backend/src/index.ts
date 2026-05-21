import express from 'express';
import cors from 'cors';
import { config } from './config';
import { testPostgresConnection } from './db/postgres';
import { connectMongo } from './db/mongo';
import apiRoutes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { securityHeaders } from './middleware/securityHeaders';
import { startSRScheduler } from './services/srScheduler';
import { startWeeklySummaryScheduler } from './services/weeklySummaryScheduler';
import { validateRoleMarketStartupConfig } from './services/roleMarketStartupValidation';

const app = express();

app.disable('x-powered-by');
app.use(
  cors({
    origin: config.app.frontendUrl,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(securityHeaders);
app.use(
  '/api/billing/webhook',
  express.raw({ type: 'application/json', limit: config.security.jsonBodyLimit }),
);
const jsonParser = express.json({ limit: config.security.jsonBodyLimit });
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/billing/webhook')) {
    next();
    return;
  }
  jsonParser(req, res, next);
});
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

app.use('/api', apiRoutes);
app.use(errorHandler);

async function start() {
  await testPostgresConnection();
  await validateRoleMarketStartupConfig();
  await connectMongo();
  startSRScheduler();
  startWeeklySummaryScheduler();
  const server = app.listen(config.app.port, () => {
    console.log(`✓ Backend running on http://localhost:${config.app.port}`);
  });

  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT',  shutdown);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
