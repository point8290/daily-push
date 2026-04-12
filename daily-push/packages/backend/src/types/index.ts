export interface UserSettings {
  id: number;
  email: string;
  digest_time: string;
  timezone: string;
  active_category_id: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface Category {
  id: number;
  title: string;
  icon: string;
  description: string | null;
  position: number;
  created_at: Date;
  subcategories?: Subcategory[];
}

export interface Subcategory {
  id: number;
  category_id: number;
  title: string;
  description: string | null;
  position: number;
  created_at: Date;
  topics?: Topic[];
}

export interface Topic {
  id: number;
  subcategory_id: number | null;
  title: string;
  description: string | null;
  status: 'pending' | 'active' | 'completed';
  position: number;
  created_at: Date;
  item_count?: number;
  done_count?: number;
}

export interface Resource {
  label: string;
  url: string;
  type: 'docs' | 'article' | 'video' | 'repo';
}

export interface StudyItem {
  id: number;
  topic_id: number;
  type: 'concept' | 'practice';
  title: string;
  description: string | null;
  resources: Resource[] | null;
  estimated_mins: number;
  position: number;
  status: 'queued' | 'current' | 'done' | 'skipped';
  created_at: Date;
  topic_title?: string;
}

export interface StudySession {
  id: number;
  study_item_id: number;
  studied_at: string;
  duration_mins: number | null;
  notes: string | null;
  created_at: Date;
  study_item_title?: string;
  topic_title?: string;
}

export interface NewsInterest {
  id: number;
  tag: string;
}

export interface NewsItem {
  id: number;
  source: 'hackernews' | 'rss';
  external_id: string | null;
  title: string;
  url: string;
  summary: string | null;
  relevance: number;
  fetched_at: Date;
}

export interface DailyDigest {
  id: number;
  sent_at: Date;
  study_item_id: number | null;
  news_item_ids: number[];
  email_status: 'sent' | 'failed';
}

export interface StreakData {
  current_streak: number;
  longest_streak: number;
  total_sessions: number;
}

export interface CalendarDay {
  date: string;
  count: number;
}

export interface GeneratedStudyItem {
  title: string;
  description: string;
  estimated_mins: number;
  resources: Resource[];
}
