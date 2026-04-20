/**
 * Reset script — wipes all user data from PostgreSQL and MongoDB.
 * Preserves: DB schema, migrations table, seeded goal_profiles, skill_assessment_bank.
 * Run: npm run reset
 */
import path from 'path';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { connectMongo, getDb } from './mongo';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL ||
    'postgresql://daily_push_user:daily_push_pass@localhost:5434/daily_push_v2',
});

async function reset() {
  console.log('⚠️  Resetting all user data...\n');

  // ── PostgreSQL ──────────────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    // TRUNCATE users CASCADE wipes everything: profiles, skills, nodes, edges,
    // sessions, SR queue, similarity index — all have ON DELETE CASCADE from users.
    await client.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
    console.log('✓  PostgreSQL — users + all cascaded tables cleared');
  } finally {
    client.release();
    await pool.end();
  }

  // ── MongoDB ─────────────────────────────────────────────────────────────────
  await connectMongo();
  const db = getDb();

  const userCollections = [
    'goals',
    'user_raw_inputs',
    'path_outcomes',
    'concept_difficulty_map',
  ];

  for (const col of userCollections) {
    const { deletedCount } = await db.collection(col).deleteMany({});
    console.log(`✓  MongoDB   — ${col}: ${deletedCount} document(s) removed`);
  }

  // Learned profiles from LLM results (not seeded, user-specific)
  const { deletedCount: learnedCount } = await db.collection('goal_profiles').deleteMany({
    source: 'llm_result',
  });
  if (learnedCount > 0) {
    console.log(`✓  MongoDB   — goal_profiles (learned): ${learnedCount} removed`);
  }

  console.log('\n✅  Reset complete. Seeded data (goal_profiles, skill_assessment_bank) preserved.');
  process.exit(0);
}

reset().catch(err => {
  console.error('Reset failed:', err);
  process.exit(1);
});
