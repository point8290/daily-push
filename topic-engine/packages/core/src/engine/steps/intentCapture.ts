import { z } from 'zod';
import { generateStructured } from '../../llm/structured';
import type { LLMProvider } from '../../llm/types';
import { LearnerLevelSchema, LearnerGoalSchema } from '../types';
import type { PipelineContext } from '../types';

const IntentSchema = z.object({
  level: LearnerLevelSchema.nullable(),
  goal: LearnerGoalSchema.nullable(),
  specificGap: z.string().nullable(),
  // true when the free-form input doesn't give enough signal to determine level
  needsQuiz: z.boolean(),
});

const INTENT_SYSTEM = `
You parse a developer's learning intent from their free-form description.

Learner levels:
- beginner: new to the topic, no prior exposure
- intermediate: uses it but can't explain internals, has specific gaps
- advanced: solid understanding, wants edge cases or depth

Learner goals:
- understand: build an initial mental model
- gap_fill: knows some of it, has specific holes
- interview_prep: needs to articulate it clearly and quickly
- deep_dive: wants internals, production concerns, edge cases
- teach: building curriculum or explaining to others

If the level or goal cannot be determined confidently from the input, set needsQuiz: true.
`.trim();

/**
 * Step 1: Parse what the user actually wants.
 * Converts free-form input into structured level + goal + specificGap.
 */
export async function captureIntent(
  ctx: PipelineContext,
  provider: LLMProvider
): Promise<PipelineContext> {
  const intent = await generateStructured(provider, IntentSchema, {
    system: INTENT_SYSTEM,
    schemaDescription:
      '{ level, goal, specificGap, needsQuiz } — parsed from the user description',
    messages: [
      {
        role: 'user',
        content: `Topic: "${ctx.topic}"\n\nUser said: "${ctx.userContext.rawInput}"\n\nParse their intent.`,
      },
    ],
    temperature: 0.1,
  });

  return {
    ...ctx,
    userContext: {
      ...ctx.userContext,
      level: intent.level ?? undefined,
      goal: intent.goal ?? undefined,
      specificGap: intent.specificGap ?? undefined,
      needsQuiz: intent.needsQuiz,
    },
  };
}
