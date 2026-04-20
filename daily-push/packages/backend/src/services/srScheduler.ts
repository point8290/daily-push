import { pool } from '../db/postgres';

async function runSRScheduler(): Promise<void> {
  try {
    const { rowCount } = await pool.query(`
      UPDATE concept_nodes cn
      SET status = 'review_due'
      FROM spaced_repetition_queue srq
      WHERE cn.id    = srq.node_id
        AND cn.user_id = srq.user_id
        AND srq.due_at <= NOW()
        AND cn.status  = 'done'
    `);
    if (rowCount && rowCount > 0) {
      console.log(`[sr-scheduler] Marked ${rowCount} node(s) as review_due`);
    }
  } catch (err) {
    console.error('[sr-scheduler] Error:', err);
  }
}

export function startSRScheduler(): void {
  runSRScheduler();                                   // catch anything due since last run
  setInterval(runSRScheduler, 60 * 60 * 1_000);      // re-check every hour
}
