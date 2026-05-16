import { pool } from '../db/postgres';

export interface ProductEventInput {
  userId: string;
  goalId?: string | null;
  sessionId?: string | null;
  eventKey: string;
  properties?: Record<string, unknown>;
}

/**
 * Best-effort product analytics writer.
 * Analytics failures should never break user flows.
 */
export async function trackProductEvent({
  userId,
  goalId = null,
  sessionId = null,
  eventKey,
  properties = {},
}: ProductEventInput): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO product_events (user_id, goal_id, session_id, event_key, properties)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [userId, goalId, sessionId, eventKey, JSON.stringify(properties)]
    );
  } catch (err) {
    console.warn('[product-events] Failed to persist event:', (err as Error).message);
  }
}
