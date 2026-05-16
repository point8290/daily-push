import { pool } from '../db/postgres';
import { callClaudeWithUsage, parseJSON } from './claude';
import { recordLlmUsage } from './llmUsage';
import { buildUserContext } from './userContext';

export interface CheckResult {
  score: number;        // 1–5 (same scale as confidence)
  feedback: string;     // one sentence of targeted feedback
  correct: boolean;     // whether the answer demonstrates understanding
  rubricScores?: Array<{
    dimension: 'correctness' | 'clarity' | 'depth' | 'application';
    score: number;
    feedback: string;
  }>;
  strengths?: string[];
  improvements?: string[];
  retryPrompt?: string;
}

export async function scoreUnderstandingAnswer(
  sessionId: string,
  answer: string,
  userId?: string
): Promise<CheckResult> {
  const { rows } = await pool.query<{ title: string; description: string; depth_level: string; goal_id: string | null }>(
    `SELECT cn.title, cn.description, cn.depth_level, cn.goal_id
     FROM study_sessions ss
     JOIN concept_nodes cn ON cn.id = ss.node_id
     WHERE ss.id = $1`,
    [sessionId]
  );

  if (rows.length === 0) {
    return { score: 3, feedback: 'Could not find session context.', correct: false };
  }

  const { title, description, depth_level, goal_id } = rows[0];

  // Pass goal_id so context is scoped to the goal being studied, not the primary goal
  const contextStr = userId ? (await buildUserContext(userId, goal_id ?? undefined)).toPromptString() : null;

  const response = await callClaudeWithUsage({
    system: `You assess whether a developer's explanation of a concept demonstrates real understanding.
Output JSON only. No prose, no markdown, no code fences.`,
    userMessage: `${contextStr ? contextStr + '\n\n' : ''}Concept: "${title}" (${depth_level} level)
Description: ${description ?? 'No description provided'}

The learner's explanation:
"${answer}"

Score their understanding on a 1–5 scale, calibrated to the learner's seniority and experience level shown above.
A senior engineer should be held to a higher standard than a junior for the same concept.
1 = completely wrong or no understanding shown
2 = vague or mostly wrong, missing the core idea
3 = partially correct, gets the gist but misses key details
4 = mostly correct, clear understanding with minor gaps
5 = fully correct, demonstrates solid understanding with precision

Return JSON:
{
  "score": 4,
  "feedback": "Good explanation — you captured the key idea but missed the trade-off between X and Y.",
  "correct": true,
  "rubricScores": [
    {
      "dimension": "correctness",
      "score": 4,
      "feedback": "The core idea is right."
    },
    {
      "dimension": "clarity",
      "score": 4,
      "feedback": "The explanation is easy to follow."
    },
    {
      "dimension": "depth",
      "score": 3,
      "feedback": "Add one trade-off or boundary."
    },
    {
      "dimension": "application",
      "score": 3,
      "feedback": "Connect it to a concrete example."
    }
  ],
  "strengths": ["You captured the main idea clearly."],
  "improvements": ["Add one concrete example or trade-off."],
  "retryPrompt": "Revise your explanation by adding one example and one trade-off."
}`,
  });
  if (userId) {
    await recordLlmUsage({
      userId,
      goalId: goal_id,
      featureKey: 'understanding_check',
      operationKey: 'session_understanding_check',
      usage: response.usage,
      metadata: {
        depthLevel: depth_level,
      },
    }).catch(() => {});
  }

  try {
    const result = parseJSON<CheckResult>(response.text);
    // Clamp score to 1-5
    result.score = Math.max(1, Math.min(5, Math.round(result.score)));
    result.rubricScores = (result.rubricScores ?? []).map((entry) => ({
      ...entry,
      score: Math.max(1, Math.min(5, Math.round(entry.score))),
    }));
    return result;
  } catch {
    return { score: 3, feedback: 'Could not parse the assessment result.', correct: false };
  }
}
