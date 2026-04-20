import { pool } from '../db/postgres';

export interface UserSettings {
  availableMinsDay: number;
  availableDaysWeek: number;
  timezone: string;
  digestTime: string | null;
  emailWeeklySummary: boolean;
}

export async function getSettings(userId: string): Promise<UserSettings> {
  const { rows } = await pool.query<{
    available_mins_day: number;
    available_days_week: number;
    timezone: string;
    digest_time: string | null;
    email_weekly_summary: boolean;
  }>(
    `SELECT available_mins_day, available_days_week, timezone, digest_time, email_weekly_summary
     FROM user_profiles_structured WHERE user_id = $1`,
    [userId]
  );

  const r = rows[0];
  return {
    availableMinsDay: r?.available_mins_day ?? 45,
    availableDaysWeek: r?.available_days_week ?? 5,
    timezone: r?.timezone ?? 'UTC',
    digestTime: r?.digest_time ?? null,
    emailWeeklySummary: r?.email_weekly_summary ?? true,
  };
}

export async function updateSettings(
  userId: string,
  patch: Partial<UserSettings>
): Promise<UserSettings> {
  await pool.query(
    `INSERT INTO user_profiles_structured
       (user_id, available_mins_day, available_days_week, timezone, digest_time, email_weekly_summary, updated_at)
     VALUES ($1,
       COALESCE($2, 45),
       COALESCE($3, 5),
       COALESCE($4, 'UTC'),
       $5::TIME,
       COALESCE($6, true),
       NOW()
     )
     ON CONFLICT (user_id) DO UPDATE SET
       available_mins_day    = COALESCE($2, user_profiles_structured.available_mins_day),
       available_days_week   = COALESCE($3, user_profiles_structured.available_days_week),
       timezone              = COALESCE($4, user_profiles_structured.timezone),
       digest_time           = COALESCE($5::TIME, user_profiles_structured.digest_time),
       email_weekly_summary  = COALESCE($6, user_profiles_structured.email_weekly_summary),
       updated_at            = NOW()`,
    [
      userId,
      patch.availableMinsDay ?? null,
      patch.availableDaysWeek ?? null,
      patch.timezone ?? null,
      patch.digestTime ?? null,
      patch.emailWeeklySummary ?? null,
    ]
  );

  return getSettings(userId);
}
