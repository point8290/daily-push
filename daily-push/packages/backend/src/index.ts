import express from 'express';
import cors from 'cors';
import { config } from './config';
import { testConnection } from './db/connection';
import { advanceQueue } from './services/roadmap';
import apiRoutes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { initScheduler } from './jobs/scheduler';

const app = express();

app.use(cors({ origin: config.app.frontendUrl }));
app.use(express.json());

app.use('/api', apiRoutes);
app.use(errorHandler);

async function start() {
  await testConnection();
  await advanceQueue();
  initScheduler();
  app.listen(config.app.port, () => {
    console.log(`✓ Backend running on http://localhost:${config.app.port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
