import { useEffect, useState } from 'react';
import { getSessions, getStreak, getCalendar } from '../api/client';

interface Session { id: number; studied_at: string; study_item_title: string; topic_title: string; duration_mins: number; }
interface Streak { current_streak: number; longest_streak: number; total_sessions: number; }
interface CalendarDay { date: string; count: number; }

export default function History() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);

  useEffect(() => {
    Promise.all([getSessions(), getStreak(), getCalendar()]).then(([s, str, cal]) => {
      setSessions((s as any).sessions);
      setStreak(str);
      setCalendar(cal);
    });
  }, []);

  // Build a 90-day grid
  const calendarMap = new Map(calendar.map((d) => [d.date, d.count]));
  const today = new Date();
  const days: { date: string; count: number }[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    days.push({ date: dateStr, count: calendarMap.get(dateStr) || 0 });
  }

  const colorForCount = (count: number) => {
    if (count === 0) return 'bg-slate-100';
    if (count === 1) return 'bg-sky-200';
    return 'bg-sky-500';
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">History</h1>

      {streak && (
        <div className="flex gap-4">
          {[
            { label: 'Current Streak', value: `${streak.current_streak} days`, icon: '🔥' },
            { label: 'Longest Streak', value: `${streak.longest_streak} days`, icon: '🏆' },
            { label: 'Total Sessions', value: streak.total_sessions, icon: '📚' },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-slate-200 rounded-lg px-5 py-3 flex items-center gap-3">
              <span className="text-2xl">{s.icon}</span>
              <div>
                <div className="text-xl font-bold text-slate-900">{s.value}</div>
                <div className="text-xs text-slate-500">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Calendar heatmap */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Last 90 Days</h2>
        <div className="flex flex-wrap gap-1">
          {days.map((d) => (
            <div key={d.date} title={`${d.date}: ${d.count} session${d.count !== 1 ? 's' : ''}`}
              className={`w-3.5 h-3.5 rounded-sm ${colorForCount(d.count)}`} />
          ))}
        </div>
        <div className="flex gap-2 mt-3 items-center text-xs text-slate-400">
          <span>Less</span>
          {['bg-slate-100', 'bg-sky-200', 'bg-sky-500'].map((c) => (
            <div key={c} className={`w-3 h-3 rounded-sm ${c}`} />
          ))}
          <span>More</span>
        </div>
      </div>

      {/* Session list */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Sessions</h2>
        {sessions.length === 0 ? (
          <p className="text-slate-400 text-sm">No sessions yet. Complete your first study item!</p>
        ) : (
          <ul className="space-y-3">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-start justify-between text-sm">
                <div>
                  <p className="font-medium text-slate-800">{s.study_item_title}</p>
                  <p className="text-slate-400 text-xs">{s.topic_title}</p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-slate-500">{new Date(s.studied_at).toLocaleDateString()}</p>
                  {s.duration_mins && <p className="text-slate-300 text-xs">{s.duration_mins} min</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
