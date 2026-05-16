import { pool } from '../db/postgres';
import { callClaudeWithUsage, parseJSON } from './claude';
import { recordLlmUsage } from './llmUsage';
import { buildUserContext } from './userContext';
import {
  type ArtifactEvaluationResult,
  type RubricDimension,
  type SessionTaskPayload,
  getSessionTask,
  saveSessionArtifact,
} from './sessionTasks';

interface ArtifactEvaluationModelOutput {
  score: number;
  feedback: string;
  correct: boolean;
  rubricScores: Array<{
    dimension: RubricDimension['key'];
    score: number;
    feedback: string;
  }>;
  strengths: string[];
  improvements: string[];
  retryPrompt: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function fallbackEvaluation(
  task: SessionTaskPayload,
  content: string,
): ArtifactEvaluationResult {
  const wordCount = countWords(content);
  const lower = content.toLowerCase();
  let score = wordCount >= 120 ? 4 : wordCount >= 60 ? 3 : 2;

  const nuanceSignals = [
    'because',
    'trade-off',
    'tradeoff',
    'for example',
    'for instance',
    'risk',
    'if',
    'when',
  ];
  if (nuanceSignals.some((signal) => lower.includes(signal))) {
    score += 1;
  }
  if (task.taskType === 'code' && /(function|const|return|if\s*\(|=>|class)/.test(content)) {
    score += 1;
  }

  score = clamp(score, 1, 5);

  const rubricScores: ArtifactEvaluationResult['rubricScores'] = task.rubric.map(
    (dimension) => ({
      dimension: dimension.key,
      score:
        dimension.key === 'application' && !/example|scenario|when|use/i.test(content)
          ? clamp(score - 1, 1, 5)
          : score,
      feedback:
        dimension.key === 'application'
          ? 'Connect the concept more explicitly to a real scenario or decision.'
          : 'Solid start, but add more precision and one concrete detail to strengthen it.',
    }),
  );

  return {
    score,
    feedback:
      score >= 4
        ? 'Strong draft. Tighten one detail or trade-off and this is ready.'
        : 'Useful start. Add more concrete detail, one example, and a clearer trade-off.',
    correct: score >= 3,
    rubricScores,
    strengths: score >= 4
      ? ['You captured the main idea clearly.', 'The response has usable structure.']
      : ['You engaged with the task directly.'],
    improvements: [
      'Add one specific example, scenario, or implementation detail.',
      'Make the trade-off or limitation more explicit.',
    ],
    retryPrompt: `Revise your response by keeping the main idea, then add one concrete example and one trade-off related to ${task.title}.`,
  };
}

export async function evaluateSessionArtifact(
  sessionId: string,
  userId: string,
  content?: string,
): Promise<ArtifactEvaluationResult> {
  let task = await getSessionTask(sessionId, userId);

  if (content && content.trim()) {
    task = await saveSessionArtifact(sessionId, userId, content.trim());
  }

  const artifactContent = task.artifact?.content?.trim() ?? '';
  if (!artifactContent) {
    throw new Error('Artifact content is required before evaluation');
  }

  if (artifactContent.length < 25) {
    throw new Error('Write a bit more before requesting AI review');
  }

  const learnerContext = await buildUserContext(userId, task.goalId);
  const contextStr = learnerContext.toPromptString();

  let evaluation: ArtifactEvaluationResult;

  try {
    const response = await callClaudeWithUsage({
      system: `You are a pragmatic engineering coach.
Evaluate learning artifacts from developers and return structured JSON only.
Do not write markdown or prose outside the JSON object.`,
      userMessage: `${contextStr}

Session task:
- Title: ${task.title}
- Task type: ${task.taskType}
- Prompt: ${task.prompt}
- Instructions: ${task.instructions.join(' | ')}
- Success criteria: ${task.successCriteria.join(' | ')}

Rubric:
${task.rubric
  .map((dimension) => `- ${dimension.key}: ${dimension.description}`)
  .join('\n')}

Learner artifact:
"""
${artifactContent}
"""

Score this artifact on the rubric.
- Use a 1-5 scale for each dimension and the overall score.
- Be stricter for vague answers, generic filler, or missing application.
- Keep feedback actionable and specific.

Return JSON:
{
  "score": 4,
  "feedback": "You captured the core concept and applied it well, but the trade-off section is still thin.",
  "correct": true,
  "rubricScores": [
    {
      "dimension": "correctness",
      "score": 4,
      "feedback": "The explanation is technically sound."
    }
  ],
  "strengths": ["You grounded the answer in a realistic example."],
  "improvements": ["Name one specific trade-off or failure mode."],
  "retryPrompt": "Revise the answer by adding one trade-off and one concrete implementation detail."
}`,
    });
    await recordLlmUsage({
      userId,
      goalId: task.goalId,
      featureKey: 'artifact_evaluation',
      operationKey: 'artifact_rubric_review',
      usage: response.usage,
      metadata: {
        taskType: task.taskType,
        artifactType: task.artifactType,
      },
    }).catch(() => {});

    const parsed = parseJSON<ArtifactEvaluationModelOutput>(response.text);
    evaluation = {
      score: clamp(Math.round(parsed.score), 1, 5),
      feedback: parsed.feedback,
      correct: Boolean(parsed.correct),
      rubricScores: task.rubric.map((dimension) => {
        const match = parsed.rubricScores?.find(
          (entry) => entry.dimension === dimension.key,
        );
        return {
          dimension: dimension.key,
          score: clamp(Math.round(match?.score ?? parsed.score ?? 3), 1, 5),
          feedback:
            match?.feedback ??
            `Add a bit more specificity for ${dimension.label.toLowerCase()}.`,
        };
      }),
      strengths: (parsed.strengths ?? []).slice(0, 3),
      improvements: (parsed.improvements ?? []).slice(0, 3),
      retryPrompt:
        parsed.retryPrompt ??
        `Revise the artifact by improving the weakest rubric dimension and adding one concrete example.`,
    };
  } catch {
    evaluation = fallbackEvaluation(task, artifactContent);
  }

  await pool.query(
    `UPDATE session_artifacts
        SET status = 'evaluated',
            score = $3,
            feedback = $4,
            evaluation = $5::jsonb,
            evaluated_at = NOW(),
            updated_at = NOW()
      WHERE session_id = $1
        AND user_id = $2`,
    [
      sessionId,
      userId,
      evaluation.score,
      evaluation.feedback,
      JSON.stringify(evaluation),
    ],
  );

  return evaluation;
}
