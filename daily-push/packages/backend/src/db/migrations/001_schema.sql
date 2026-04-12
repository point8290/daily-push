-- User settings (single-user app)
CREATE TABLE IF NOT EXISTS user_settings (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  email       VARCHAR(255) NOT NULL,
  digest_time VARCHAR(5) NOT NULL DEFAULT '08:00',
  timezone    VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- High-level topics the user wants to learn
CREATE TABLE IF NOT EXISTS topics (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  status      ENUM('pending','active','completed') DEFAULT 'pending',
  position    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Individual study items (subtopics) within a topic
CREATE TABLE IF NOT EXISTS study_items (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  topic_id        INT NOT NULL,
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  resources       JSON,
  estimated_mins  INT DEFAULT 30,
  position        INT NOT NULL DEFAULT 0,
  status          ENUM('queued','current','done','skipped') DEFAULT 'queued',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
  INDEX idx_status (status),
  INDEX idx_topic_position (topic_id, position)
);

-- Log of completed study sessions
CREATE TABLE IF NOT EXISTS study_sessions (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  study_item_id   INT NOT NULL,
  studied_at      DATE NOT NULL,
  duration_mins   INT,
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (study_item_id) REFERENCES study_items(id),
  UNIQUE KEY uq_item_date (study_item_id, studied_at),
  INDEX idx_studied_at (studied_at)
);

-- User's interest tags for news filtering
CREATE TABLE IF NOT EXISTS news_interests (
  id    INT PRIMARY KEY AUTO_INCREMENT,
  tag   VARCHAR(100) NOT NULL UNIQUE
);

-- Fetched and scored news items cache
CREATE TABLE IF NOT EXISTS news_items (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  source        ENUM('hackernews','rss') NOT NULL,
  external_id   VARCHAR(255),
  title         VARCHAR(500) NOT NULL,
  url           TEXT NOT NULL,
  summary       TEXT,
  relevance     TINYINT DEFAULT 0,
  fetched_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_source_id (source, external_id),
  INDEX idx_relevance (relevance),
  INDEX idx_fetched_at (fetched_at)
);

-- Log of daily digests sent
CREATE TABLE IF NOT EXISTS daily_digests (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  sent_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  study_item_id   INT,
  news_item_ids   JSON,
  email_status    ENUM('sent','failed') DEFAULT 'sent',
  FOREIGN KEY (study_item_id) REFERENCES study_items(id)
);
