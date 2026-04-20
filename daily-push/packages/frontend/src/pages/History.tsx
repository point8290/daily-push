import { useEffect, useState } from 'react';
import { getSessionCalendar, getStreak } from '../api/client';

interface CalendarDay { date: string; count: number; }
interface StreakData { currentStreak: number; lastActiveDate: string | null; totalSessions: number; }

const heatBg = ['var(--slate-100)', 'var(--sky-200)', 'var(--sky-400)', 'var(--sky-500)', 'var(--sky-700)'];

function heatIdx(count: number) {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return 4;
}

function CalendarHeatmap({ days }: { days: CalendarDay[] }) {
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div className="overflow-x-auto">
      <div style={{ display: 'flex', gap: 4 }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {week.map(day => (
              <div
                key={day.date}
                title={`${day.date}: ${day.count} session${day.count !== 1 ? 's' : ''}`}
                style={{ width: 14, height: 14, borderRadius: 3, background: heatBg[heatIdx(day.count)] }}
              />
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, fontSize: 11, color: 'var(--fg-3)' }}>
        <span>Less</span>
        {heatBg.map((c, i) => <div key={i} style={{ width: 12, height: 12, borderRadius: 3, background: c }} />)}
        <span>More</span>
      </div>
    </div>
  );
}

function StatTile({ value, label, color = 'var(--slate-800)' }: { value: string; label: string; color?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 text-center shadow-[var(--shadow-xs)]">
      <div className="font-display text-[32px]" style={{ color, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      <div className="text-sm text-slate-500 mt-[5px]">{label}</div>
    </div>
  );
}

export default function History() {
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getSessionCalendar(90), getStreak()]).then(([cal, str]) => {
      setCalendar(cal);
      setStreak(str);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const totalMins = calendar.reduce((acc, d) => acc + d.count * 30, 0);
  const totalHours = Math.floor(totalMins / 60);
  const remMins = totalMins % 60;

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-7 h-7 border-[3px] border-slate-200 border-t-sky-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-7">
      <h1 className="font-display text-[28px] text-slate-900" style={{ letterSpacing: '-0.02em' }}>History</h1>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3.5">
        <StatTile value={String(streak?.currentStreak ?? 0)} label="Day streak" color="var(--sky-600)" />
        <StatTile value={String(streak?.totalSessions ?? 0)} label="Total sessions" />
        <StatTile value={totalHours > 0 ? `${totalHours}h` : `${remMins}m`} label="Time studied" />
      </div>

      {/* Heatmap */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[var(--shadow-xs)]">
        <h2 className="font-display text-[15px] text-slate-700 mb-[18px]">Last 90 days</h2>
        {calendar.length > 0
          ? <CalendarHeatmap days={calendar} />
          : <p className="text-slate-400 text-sm">No sessions yet.</p>
        }
      </div>

      {streak?.lastActiveDate && (
        <p className="text-xs text-slate-400 text-center">Last session: {streak.lastActiveDate}</p>
      )}
    </div>
  );
}
