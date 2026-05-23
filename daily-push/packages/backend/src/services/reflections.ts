import { ObjectId } from 'mongodb';
import { getDb } from '../db/mongo';
import { callClaude, parseJSON } from './claude';

export interface ReflectionPrompt {
  question: string;
  context: 'momentum' | 'relevance' | 'difficulty' | 'progress';
}

export interface ReflectionResponse {
  promptQuestion: string;
  answer: string;
  momentumRating?: number;   // 1–5
  relevanceRating?: number;  // 1–5
}

// Generate a reflection prompt based on where the user is in their journey
export async function generateReflectionPrompt(
  goalId: string
): Promise<ReflectionPrompt> {
  const db = getDb();

  let id: ObjectId;
  try { id = new ObjectId(goalId); }
  catch { return fallbackPrompt(); }

  const goal = await db.collection('goals').findOne({ _id: id });
  if (!goal) return fallbackPrompt();

  const reflectionCount = (goal.reflections ?? []).length;
  const progressPct = goal.structured?.estimatedWeeks
    ? Math.min(100, reflectionCount * 10) // rough estimate
    : 0;

  // Rotate through prompt types based on count
  const prompts: ReflectionPrompt[] = [
    {
      context: 'momentum',
      question: `On a scale of 1–5, how motivated are you feeling about your learning this week? What's driving that feeling?`,
    },
    {
      context: 'relevance',
      question: `How relevant has what you've been studying felt to your actual goal? Does anything feel off-track?`,
    },
    {
      context: 'difficulty',
      question: `What's been the hardest concept you've encountered recently? What made it difficult?`,
    },
    {
      context: 'progress',
      question: `How would you describe your progress to someone else? What have you actually learned that you couldn't do before?`,
    },
  ];

  return prompts[reflectionCount % prompts.length];
}

function fallbackPrompt(): ReflectionPrompt {
  return {
    context: 'momentum',
    question: "How are you feeling about your learning journey this week?",
  };
}

// Check if a weekly reflection is due (last one > 6 days ago)
export async function isReflectionDue(goalId: string): Promise<boolean> {
  const db = getDb();

  let id: ObjectId;
  try { id = new ObjectId(goalId); }
  catch { return false; }

  const goal = await db.collection('goals').findOne(
    { _id: id },
    { projection: { status: 1, createdAt: 1, updatedAt: 1, reflections: { $slice: -1 } } }
  );

  if (!goal || goal.status !== 'active') return false;

  const reflections = goal.reflections ?? [];
  if (reflections.length === 0) {
    const createdAt = new Date(goal.createdAt ?? goal.updatedAt ?? 0);
    const daysSinceCreated = (Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000);
    return Number.isFinite(daysSinceCreated) && daysSinceCreated >= 7;
  }

  const lastReflection = reflections[reflections.length - 1];
  const lastAt = new Date(lastReflection.createdAt ?? 0);
  const daysSinceLast = (Date.now() - lastAt.getTime()) / (24 * 60 * 60 * 1000);

  return daysSinceLast >= 7;
}

// Save a reflection response
export async function saveReflection(
  goalId: string,
  userId: string,
  response: ReflectionResponse
): Promise<void> {
  const db = getDb();

  let id: ObjectId;
  try { id = new ObjectId(goalId); }
  catch { throw new Error('Invalid goalId'); }

  await db.collection('goals').updateOne(
    { _id: id, userId },
    {
      $push: {
        reflections: {
          _id: new ObjectId(),
          trigger: 'weekly',
          raw: {
            prompt: response.promptQuestion,
            response: response.answer,
          },
          structured: {
            momentumRating: response.momentumRating ?? null,
            relevanceRating: response.relevanceRating ?? null,
          },
          createdAt: new Date(),
        },
      } as any,
      $set: { updatedAt: new Date() },
    }
  );
}
