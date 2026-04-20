import { pool } from '../db/postgres';
import { callClaude, parseJSON } from './claude';

export interface CheckResult {
  score: number;        // 1–5 (same scale as confidence)
  feedback: string;     // one sentence of targeted feedback
  correct: boolean;     // whether the answer demonstrates understanding
}

// Score a free-text understanding answer against a concept node
export async function scoreUnderstandingAnswer(
  sessionId: string,
  answer: string
): Promise<CheckResult> {
  // Fetch node info for this session
  const { rows } = await pool.query<{ title: string; description: string; depth_level: string }>(
    `SELECT cn.title, cn.description, cn.depth_level
     FROM study_sessions ss
     JOIN concept_nodes cn ON cn.id = ss.node_id
     WHERE ss.id = $1`,
    [sessionId]
  );

  if (rows.length === 0) {
    return { score: 3, feedback: 'Could not find session context.', correct: false };
  }

  const { title, description, depth_level } = rows[0];

  const text = await callClaude({
    system: `You assess whether a developer's explanation of a concept demonstrates real understanding.
Output JSON only. No prose, no markdown, no code fences.`,
    userMessage: `Concept: "${title}" (${depth_level} level)
Description: ${description ?? 'No description provided'}

The learner's explanation:
"${answer}"

Score their understanding on a 1–5 scale:
1 = completely wrong or no understanding shown
2 = vague or mostly wrong, missing the core idea
3 = partially correct, gets the gist but misses key details
4 = mostly correct, clear understanding with minor gaps
5 = fully correct, demonstrates solid understanding with precision

Return JSON:
{
  "score": 4,
  "feedback": "Good explanation — you captured the key idea but missed the trade-off between X and Y.",
  "correct": true
}`,
  });

  try {
    const result = parseJSON<CheckResult>(text);
    // Clamp score to 1-5
    result.score = Math.max(1, Math.min(5, Math.round(result.score)));
    return result;
  } catch {
    return { score: 3, feedback: 'Could not parse the assessment result.', correct: false };
  }
}
