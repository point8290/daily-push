import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });

// Imported after dotenv so the database config sees the env vars.
async function main() {
  const { connectMongo, closeMongo } = await import('../mongo');
  const { pool } = await import('../postgres');
  const { seedDemoAccount } = await import('./demo');
  const email = process.argv[2] || process.env.DEMO_EMAIL;
  if (!email) {
    console.error('Usage: npm run seed:demo -- <demo-email>   (or set DEMO_EMAIL)');
    process.exit(1);
  }
  await connectMongo();
  const result = await seedDemoAccount(email);
  console.log(`Demo account ready: user ${result.userId}, plan ${result.goalId}`);
  await closeMongo();
  await pool.end();
}

main().catch((err) => {
  console.error('Demo seed failed:', err);
  process.exit(1);
});
