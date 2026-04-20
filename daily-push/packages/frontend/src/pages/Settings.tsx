import { useEffect, useState } from 'react';
import { getSettings, updateSettings } from '../api/client';

const TIMEZONES = [
  'UTC', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo',
  'Australia/Sydney', 'Europe/London', 'Europe/Berlin',
  'America/New_York', 'America/Chicago', 'America/Los_Angeles',
];

interface Settings {
  availableMinsDay: number;
  availableDaysWeek: number;
  timezone: string;
  digestTime: string | null;
  emailWeeklySummary: boolean;
}

export default function Settings() {
  const [form, setForm] = useState<Settings>({
    availableMinsDay: 45,
    availableDaysWeek: 5,
    timezone: 'UTC',
    digestTime: null,
    emailWeeklySummary: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    getSettings().then((s: Settings) => {
      setForm(s);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      await updateSettings(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setSaveError(err?.response?.data?.error ?? 'Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="text-slate-400 text-sm text-center py-16">Loading settings...</div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Study schedule */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Study schedule</h2>

          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Minutes per day
            </label>
            <input
              type="number"
              min={5}
              max={480}
              value={form.availableMinsDay}
              onChange={e => setForm(f => ({ ...f, availableMinsDay: parseInt(e.target.value, 10) || 45 }))}
              className="w-32 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
            <p className="text-xs text-slate-400 mt-1">Used to estimate your weekly pace</p>
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Days per week
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5, 6, 7].map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, availableDaysWeek: d }))}
                  className={`w-9 h-9 rounded-full text-sm font-medium transition-colors ${
                    form.availableDaysWeek === d
                      ? 'bg-sky-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Timezone & digest */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Timezone & email</h2>

          <div>
            <label className="block text-sm text-slate-600 mb-1">Timezone</label>
            <select
              value={form.timezone}
              onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              {TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">Daily digest time (optional)</label>
            <input
              type="time"
              value={form.digestTime ?? ''}
              onChange={e => setForm(f => ({ ...f, digestTime: e.target.value || null }))}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={form.emailWeeklySummary}
              onClick={() => setForm(f => ({ ...f, emailWeeklySummary: !f.emailWeeklySummary }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.emailWeeklySummary ? 'bg-sky-500' : 'bg-slate-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  form.emailWeeklySummary ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm text-slate-700">Weekly summary email</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save settings'}
          </button>
          {saved && <span className="text-sm text-emerald-600 font-medium">Saved!</span>}
          {saveError && <span className="text-sm text-red-600">{saveError}</span>}
        </div>
      </form>
    </div>
  );
}
