import path from 'path';
import dotenv from 'dotenv';
import { connectMongo, getDb } from '../mongo';
import { GOAL_PROFILES } from './goalProfiles';
import { SKILL_BANK } from './skillBank';

dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });

async function seed() {
  await connectMongo();
  const db = getDb();

  console.log('Seeding goal_profiles...');
  for (const profile of GOAL_PROFILES) {
    await db.collection('goal_profiles').updateOne(
      { profileId: profile.profileId },
      { $set: { ...profile, seededAt: new Date() } },
      { upsert: true }
    );
    console.log(`  ✓  ${profile.profileId}`);
  }

  console.log('Seeding skill_assessment_bank...');
  for (const entry of SKILL_BANK) {
    await db.collection('skill_assessment_bank').updateOne(
      { skillArea: entry.skillArea },
      { $set: { ...entry, seededAt: new Date() } },
      { upsert: true }
    );
    console.log(`  ✓  ${entry.skillArea}`);
  }

  // Ensure indexes
  await db.collection('goal_profiles').createIndex({ profileId: 1 }, { unique: true });
  await db.collection('goal_profiles').createIndex({ signals: 1 });
  await db.collection('skill_assessment_bank').createIndex({ skillArea: 1 }, { unique: true });
  await db.collection('skill_assessment_bank').createIndex({ aliases: 1 });
  await db.collection('path_outcomes').createIndex({ userId: 1, goalId: 1 });
  await db.collection('path_outcomes').createIndex({ goalType: 1, achievedAt: -1 });
  await db.collection('concept_difficulty_map').createIndex({ nodeTitle: 1, depthLevel: 1, profileGroup: 1 }, { unique: true });

  console.log('Seed complete.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
