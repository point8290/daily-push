import { getDb } from '../db/mongo';
import { seedDemoAccount } from '../db/seed/demo';

/**
 * The public demo account (DEMO_EMAIL) is rebuilt from the hand-written seed
 * at most once a day: on the first demo login after it goes stale, or when
 * the reset endpoint is called. Visitors can click anything; the next day it
 * is clean again.
 */

const STALE_AFTER_MS = 20 * 60 * 60 * 1000;
let running: Promise<void> | null = null;

export function demoEmail(): string | null {
  const value = process.env.DEMO_EMAIL?.trim().toLowerCase();
  return value ? value : null;
}

export function isDemoEmail(email: string | null | undefined): boolean {
  const demo = demoEmail();
  return Boolean(demo && email && email.trim().toLowerCase() === demo);
}

export async function resetDemoAccount(): Promise<void> {
  const email = demoEmail();
  if (!email) throw new Error('DEMO_EMAIL is not set');
  if (running) return running;
  running = (async () => {
    await seedDemoAccount(email);
    await getDb()
      .collection<{ _id: string; lastResetAt: Date }>('app_state')
      .updateOne({ _id: 'demo_account' }, { $set: { lastResetAt: new Date() } }, { upsert: true });
  })().finally(() => {
    running = null;
  });
  return running;
}

export async function ensureFreshDemoAccount(): Promise<void> {
  if (!demoEmail()) return;
  const state = await getDb()
    .collection<{ _id: string; lastResetAt?: Date }>('app_state')
    .findOne({ _id: 'demo_account' });
  const last = state?.lastResetAt ? new Date(state.lastResetAt).getTime() : 0;
  if (Date.now() - last < STALE_AFTER_MS) return;
  await resetDemoAccount();
}
