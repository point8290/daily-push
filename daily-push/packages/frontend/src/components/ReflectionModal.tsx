import { useState } from 'react';
import { saveReflection } from '../api/client';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-5">
        {done ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-semibold text-slate-800">Reflection saved</p>
          </div>
        ) : (
          <>
            <div>
              <p className="text-xs font-semibold text-sky-600 uppercase tracking-widest mb-2">Weekly check-in</p>
              <p className="text-base font-semibold text-slate-800 leading-snug">{prompt.question}</p>
            </div>

            {isMotivation && (
              <div>
                <p className="text-xs text-slate-400 mb-2">Momentum rating (optional)</p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setMomentumRating(n)}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                        momentumRating === n
                          ? 'bg-sky-500 text-white border-sky-500'
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-slate-400 mt-1 px-1">
                  <span>Struggling</span><span>Fired up</span>
                </div>
              </div>
            )}

            <textarea
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              placeholder="Share your thoughts..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"
              rows={4}
              autoFocus
            />

            <div className="flex items-center gap-3">
              <button
                onClick={handleSubmit}
                disabled={!answer.trim() || saving}
                className="flex-1 bg-sky-600 hover:bg-sky-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
              >
                {saving ? 'Saving...' : 'Save reflection'}
              </button>
              <button
                onClick={onDismiss}
                className="px-4 py-2.5 text-sm text-slate-400 hover:text-slate-600 transition-colors"
              >
                Skip
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
