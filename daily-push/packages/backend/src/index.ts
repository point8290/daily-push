import express from 'express';
import cors from 'cors';
import { config } from './config';
import { testPostgresConnection } from './db/postgres';
import { connectMongo } from './db/mongo';
import apiRoutes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { startSRScheduler } from './services/srScheduler';

const app = express();

app.use(cors({ origin: config.app.frontendUrl }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

app.use('/api', apiRoutes);
app.use(errorHandler);

async function start() {
  await testPostgresConnection();
  await connectMongo();
  startSRScheduler();
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
