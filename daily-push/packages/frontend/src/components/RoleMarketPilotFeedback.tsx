import { useMemo, useState } from 'react';
import { trackEvent, trackPublicEvent } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import SurfaceCard from './ui/SurfaceCard';

const usefulnessScores = [1, 2, 3, 4, 5];
const reasonOptions = [
  { value: 'clear_next_step', label: 'Clear next step' },
  { value: 'role_fit_unclear', label: 'Role fit felt unclear' },
  { value: 'missing_market_depth', label: 'Need deeper market proof' },
  { value: 'proof_plan_helpful', label: 'Proof plan was useful' },
  { value: 'too_generic', label: 'Too generic' },
];

interface RoleMarketPilotFeedbackProps {
  source: 'career_market_recommendations' | 'target_role_workspace' | 'upgrade_plan';
  roleProfileId?: string | null;
  targetRoleId?: string | null;
  ctaLocation: string;
  compact?: boolean;
}

export default function RoleMarketPilotFeedback({
  source,
  roleProfileId,
  targetRoleId,
  ctaLocation,
  compact = false,
}: RoleMarketPilotFeedbackProps) {
  const { user } = useAuth();
  const [score, setScore] = useState<number | null>(null);
  const [reason, setReason] = useState(reasonOptions[0].value);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const noteValue = useMemo(() => note.trim().slice(0, 600), [note]);

  async function handleSubmit() {
    if (!score) {
      setError('Pick a usefulness score first.');
      return;
    }

    setSubmitting(true);
    setError('');
    const payload = {
      source,
      ctaLocation,
      roleProfileId: roleProfileId ?? null,
      targetRoleId: targetRoleId ?? null,
      usefulnessScore: score,
      feedbackReason: reason,
      feedbackNote: noteValue || null,
      noteLength: noteValue.length,
    };

    try {
      if (user) {
        await trackEvent({
          eventKey: 'role_market_feedback_submitted',
          properties: payload,
        });
      } else {
        await trackPublicEvent({
          eventKey: 'role_market_feedback_submitted',
          properties: payload,
        });
      }
      setSubmitted(true);
    } catch {
      setError('Could not save feedback right now.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <SurfaceCard p={compact ? 4 : 5} className="border-emerald-100 bg-emerald-50/90">
        <p className="text-sm font-black text-emerald-800">Thanks. This helps shape the pilot.</p>
        <p className="mt-1 text-sm leading-6 text-emerald-800/75">
          We will use this to improve role direction, proof planning, and Sprint conversion.
        </p>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard p={compact ? 4 : 5} className="bg-white/90">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">
            Pilot feedback
          </p>
          <h3 className="mt-2 text-xl font-black tracking-[-0.04em] text-slate-950">
            Did this make your next move clearer?
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
            One quick signal helps us improve role direction, proof tasks, and the paid Sprint path.
          </p>
        </div>
        <div className="flex gap-2">
          {usefulnessScores.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setScore(value)}
              className={`h-10 w-10 rounded-2xl border text-sm font-black transition ${
                score === value
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300'
              }`}
              aria-label={`Usefulness score ${value}`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[0.85fr_1.15fr]">
        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
            Main signal
          </span>
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          >
            {reasonOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
            Optional note
          </span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, 600))}
            placeholder="What should be clearer? Do not include contact details."
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          />
        </label>
      </div>

      {error && (
        <p className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={submitting}
        className="mt-4 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Saving feedback...' : 'Send feedback'}
      </button>
    </SurfaceCard>
  );
}
