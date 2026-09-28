import { useEffect, useState } from 'react';
import {
  getGoalWeeklyCheckin,
  saveGoalWeeklyCheckin,
  type GoalWeeklyCheckinState,
} from '../api/client';
import AppModal from './ui/AppModal';

function toLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function RatingRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: [string, string];
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-slate-800">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => onChange(score)}
            aria-pressed={value === score}
            className={`h-10 w-10 rounded-xl border text-sm font-semibold transition-colors ${
              value === score
                ? 'border-sky-600 bg-sky-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            {score}
          </button>
        ))}
      </div>
      <div className="mt-1 flex w-[14.5rem] justify-between text-xs text-slate-400">
        <span>{hint[0]}</span>
        <span>{hint[1]}</span>
      </div>
    </div>
  );
}

const fieldCls =
  'w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400';

export default function WeeklyCheckinModal({
  goalId,
  goalTitle,
  isOpen,
  onClose,
  onSaved,
}: {
  goalId: string;
  goalTitle?: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (state: GoalWeeklyCheckinState) => void;
}) {
  const [confidence, setConfidence] = useState(3);
  const [momentum, setMomentum] = useState(3);
  const [wins, setWins] = useState('');
  const [blockers, setBlockers] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  // Load this week's check-in (if any) each time the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setError('');
    getGoalWeeklyCheckin(goalId)
      .then((state) => {
        const latest = state.latestCheckin;
        const thisWeek = Boolean(latest && latest.weekStart === state.weekStart);
        setEditing(Boolean(thisWeek));
        if (latest && thisWeek) {
          setConfidence(latest.confidence);
          setMomentum(latest.momentum);
          setWins(latest.wins.join('\n'));
          setBlockers(latest.blockers.join('\n'));
          setNotes(latest.notes ?? '');
        } else {
          setConfidence(latest?.confidence ?? 3);
          setMomentum(latest?.momentum ?? 3);
          setWins('');
          setBlockers('');
          setNotes('');
        }
      })
      .catch(() => {});
  }, [isOpen, goalId]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const result = await saveGoalWeeklyCheckin(goalId, {
        confidence,
        momentum,
        wins: toLines(wins),
        blockers: toLines(blockers),
        notes: notes.trim() || null,
      });
      onSaved?.(result);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not save your check-in. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Edit this week’s check-in' : 'Weekly check-in'}
      description={`Two minutes on how the week went${goalTitle ? ` for ${goalTitle}` : ''}. Blockers you list shape next week’s plan.`}
      closeOnOverlayClick={false}
      footer={(
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:border-slate-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save check-in'}
          </button>
        </>
      )}
    >
      <div className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <RatingRow label="How sure are you about the goal?" hint={['Not sure', 'Very sure']} value={confidence} onChange={setConfidence} />
          <RatingRow label="How is your momentum?" hint={['Stuck', 'Flying']} value={momentum} onChange={setMomentum} />
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-slate-800">Wins</span>
          <textarea
            value={wins}
            onChange={(e) => setWins(e.target.value)}
            rows={3}
            placeholder="One per line. e.g. finished the caching concept"
            className={fieldCls}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-slate-800">What got in the way</span>
          <textarea
            value={blockers}
            onChange={(e) => setBlockers(e.target.value)}
            rows={3}
            placeholder="One per line. e.g. release week at work"
            className={fieldCls}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-slate-800">
            Notes <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything next week should keep in mind."
            className={fieldCls}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </AppModal>
  );
}
