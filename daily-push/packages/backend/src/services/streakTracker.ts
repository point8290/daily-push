import { pool } from '../db/connection';
import { StreakData, CalendarDay } from '../types';

export async function getStreakData(): Promise<StreakData> {
  const conn = await pool.getConnection();
  try {
    const [sessions] = await conn.query<any[]>(
      `SELECT DISTINCT DATE(studied_at) as day
       FROM study_sessions
       ORDER BY day DESC`
    );

    const days = sessions.map((r: any) => r.day as string);
    const total_sessions = days.length;

    if (days.length === 0) {
      return { current_streak: 0, longest_streak: 0, total_sessions: 0 };
    }

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    let current_streak = 0;
    const startDay = days[0] === today || days[0] === yesterday ? days[0] : null;

    if (startDay) {
      let expected = new Date(startDay);
      for (const day of days) {
        const dayStr = new Date(day).toISOString().split('T')[0];
        const expectedStr = expected.toISOString().split('T')[0];
        if (dayStr === expectedStr) {
          current_streak++;
          expected.setDate(expected.getDate() - 1);
        } else {
          break;
        }
      }
    }

    // Calculate longest streak
    let longest_streak = 0;
    let streak = 1;
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(days[i - 1]);
      const curr = new Date(days[i]);
      const diff = (prev.getTime() - curr.getTime()) / 86400000;
      if (Math.round(diff) === 1) {
        streak++;
        longest_streak = Math.max(longest_streak, streak);
      } else {
        streak = 1;
      }
    }
    longest_streak = Math.max(longest_streak, streak);

    return { current_streak, longest_streak, total_sessions };
  } finally {
    conn.release();
  }
}

export async function getCalendarData(days = 90): Promise<CalendarDay[]> {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query<any[]>(
      `SELECT DATE(studied_at) as date, COUNT(*) as count
       FROM study_sessions
       WHERE studied_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE(studied_at)
       ORDER BY date ASC`,
      [days]
    );
    return rows.map((r: any) => ({ date: r.date, count: Number(r.count) }));
  } finally {
    conn.release();
  }
}
