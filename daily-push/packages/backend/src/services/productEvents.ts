import { pool } from '../db/postgres';

export interface ProductEventInput {
  userId?: string | null;
  anonymousId?: string | null;
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
  userId = null,
  anonymousId = null,
  goalId = null,
  sessionId = null,
  eventKey,
  properties = {},
}: ProductEventInput): Promise<void> {
  if (!userId && !anonymousId) {
    console.warn('[product-events] Skipping event without userId or anonymousId:', eventKey);
    return;
  }

  try {
    await pool.query(
      `INSERT INTO product_events
         (user_id, anonymous_id, goal_id, session_id, event_key, properties)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        userId,
        anonymousId,
        goalId,
        sessionId,
        eventKey,
        JSON.stringify(properties),
      ],
    );
  } catch (err) {
    console.warn('[product-events] Failed to persist event:', (err as Error).message);
  }
}
