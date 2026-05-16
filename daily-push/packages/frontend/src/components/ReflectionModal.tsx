import { useState } from 'react';
import { saveReflection } from '../api/client';
import SurfaceCard from './ui/SurfaceCard';

interface Props {
  goalId: string;
  prompt: { question: string; context: string };
  onDismiss: () => void;
}

export default function ReflectionModal({ goalId, prompt, onDismiss }: Props) {
  const [answer, setAnswer] = useState('');
  const [momentumRating, setMomentumRating] = useState(0);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const isMotivation = prompt.context === 'momentum';

  async function handleSubmit() {
    if (!answer.trim()) return;
    setSaving(true);
    try {
      await saveReflection(goalId, {
        answer: answer.trim(),
        promptQuestion: prompt.question,
        momentumRating: isMotivation ? momentumRating || undefined : undefined,
      });
      setDone(true);
      setTimeout(onDismiss, 1200);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <SurfaceCard p={{ base: 6, md: 7 }} className="w-full max-w-lg">
        {done ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-display text-xl text-slate-900" style={{ letterSpacing: '-0.02em' }}>
              Reflection saved
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Your weekly signal is now part of the plan.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-sky-700">
                  Weekly check-in
                </p>
                <p className="font-display text-xl leading-tight text-slate-900" style={{ letterSpacing: '-0.02em' }}>
                  {prompt.question}
                </p>
                <p className="text-sm leading-relaxed text-slate-500">
                  A short reflection helps the recovery plan stay grounded in what actually happened.
                </p>
              </div>
              <button
                onClick={onDismiss}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
              >
                Close
              </button>
            </div>

            {isMotivation ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Momentum rating
                </p>
                <div className="mt-3 flex gap-2">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      onClick={() => setMomentumRating(value)}
                      className={`flex-1 rounded-xl border py-2 text-sm font-semibold transition-colors ${
                        momentumRating === value
                          ? 'border-sky-500 bg-sky-500 text-white'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex justify-between px-1 text-xs text-slate-400">
                  <span>Struggling</span>
                  <span>Fired up</span>
                </div>
              </div>
            ) : null}

            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Share what moved, what stalled, or what needs a better next step."
              className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-400"
              rows={5}
              autoFocus
            />

            <div className="flex items-center gap-3">
              <button
                onClick={() => void handleSubmit()}
                disabled={!answer.trim() || saving}
                className="flex-1 rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-40"
              >
                {saving ? 'Saving...' : 'Save reflection'}
              </button>
              <button
                onClick={onDismiss}
                className="px-4 py-2.5 text-sm font-semibold text-slate-400 transition-colors hover:text-slate-600"
              >
                Skip
              </button>
            </div>
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
