import { useEffect, useState } from 'react';
import { getSettings, updateSettings, previewDigest, sendDigest, getCategories } from '../api/client';

const TIMEZONES = ['Asia/Kolkata', 'UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Singapore'];

export default function Settings() {
  const [email, setEmail] = useState('');
  const [digestTime, setDigestTime] = useState('08:00');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [activeCategoryId, setActiveCategoryId] = useState<number | ''>('');
  const [categories, setCategories] = useState<{ id: number; title: string; icon: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<any>(null);

  useEffect(() => {
    getSettings().then((s: any) => {
      if (s) {
        setEmail(s.email);
        setDigestTime(s.digest_time);
        setTimezone(s.timezone);
        setActiveCategoryId(s.active_category_id ?? '');
      }
    });
    getCategories().then((cats: any[]) => setCategories(cats));
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    await updateSettings({
      email,
      digest_time: digestTime,
      timezone,
      active_category_id: activeCategoryId === '' ? null : activeCategoryId,
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSend = async () => {
    setSending(true); setSendResult('');
    try {
      const result = await sendDigest();
      setSendResult(`Sent to ${result.sent_to}`);
    } catch {
      setSendResult('Failed to send. Check your Resend API key and email.');
    }
    setSending(false);
  };

  const handlePreview = async () => {
    setPreviewing(true);
    const data = await previewDigest();
    setPreview(data);
    setPreviewing(false);
  };

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-slate-700">Email & Digest</h2>

        <div>
          <label className="text-sm text-slate-600 block mb-1">Email address</label>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email"
            placeholder="you@example.com"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
        </div>

        <div>
          <label className="text-sm text-slate-600 block mb-1">Digest time</label>
          <input value={digestTime} onChange={e => setDigestTime(e.target.value)} type="time"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
        </div>

        <div>
          <label className="text-sm text-slate-600 block mb-1">Timezone</label>
          <select value={timezone} onChange={e => setTimezone(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400">
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>

        <div>
          <label className="text-sm text-slate-600 block mb-1">Active category for daily push</label>
          <select
            value={activeCategoryId}
            onChange={e => setActiveCategoryId(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            <option value="">All categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.title}</option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">Your daily push email will pull study items from this category only.</p>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="bg-sky-600 hover:bg-sky-700 text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
          {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Settings'}
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <h2 className="font-semibold text-slate-700">Test Digest</h2>
        <p className="text-slate-500 text-sm">Preview what today's digest looks like, or send it now.</p>
        <div className="flex gap-3">
          <button onClick={handlePreview} disabled={previewing}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold">
            {previewing ? 'Loading...' : 'Preview Digest'}
          </button>
          <button onClick={handleSend} disabled={sending || !email}
            className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
            {sending ? 'Sending...' : 'Send Now'}
          </button>
        </div>
        {sendResult && <p className="text-sm text-slate-600">{sendResult}</p>}
      </div>

      {preview && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="font-semibold text-slate-700 mb-3">Digest Preview</h2>
          <div className="space-y-2 text-sm">
            <p><span className="text-slate-400">Study item:</span> <strong>{preview.studyItem?.title || 'None'}</strong></p>
            <p><span className="text-slate-400">News items:</span> {preview.newsItems?.length || 0}</p>
            <p><span className="text-slate-400">Streak:</span> {preview.streak?.current_streak} days</p>
          </div>
          <details className="mt-4">
            <summary className="text-xs text-slate-400 cursor-pointer">Show email HTML</summary>
            <iframe srcDoc={preview.html} className="w-full h-96 mt-2 border border-slate-200 rounded" />
          </details>
        </div>
      )}
    </div>
  );
}
