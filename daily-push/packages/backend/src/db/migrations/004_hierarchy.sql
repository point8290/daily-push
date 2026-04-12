-- Add 4-level hierarchy: categories → subcategories → topics → study_items
-- Safe to run after 003 has cleared and re-seeded

-- Level 1: Categories
CREATE TABLE IF NOT EXISTS categories (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  title       VARCHAR(255) NOT NULL,
  icon        VARCHAR(10) DEFAULT '📚',
  description TEXT,
  position    INT DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Level 2: Subcategories
CREATE TABLE IF NOT EXISTS subcategories (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  category_id INT NOT NULL,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  position    INT DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
  INDEX idx_category (category_id)
);

-- Link topics to subcategories
ALTER TABLE topics ADD COLUMN subcategory_id INT DEFAULT NULL AFTER id;
ALTER TABLE topics ADD CONSTRAINT fk_topics_subcategory
  FOREIGN KEY (subcategory_id) REFERENCES subcategories(id) ON DELETE CASCADE;

-- Add session type to study_items
ALTER TABLE study_items ADD COLUMN type ENUM('concept','practice') DEFAULT 'concept' AFTER topic_id;

-- Add active category to user_settings
ALTER TABLE user_settings ADD COLUMN active_category_id INT DEFAULT NULL AFTER timezone;
