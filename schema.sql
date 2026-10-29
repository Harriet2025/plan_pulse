-- AuraGoal schema (MySQL 8.0.16+ required for CHECK constraints)

CREATE DATABASE IF NOT EXISTS auragoal
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE auragoal;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS notification_log;
DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS password_resets;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS sub_plans;
DROP TABLE IF EXISTS goals;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------
-- users
-- ---------------------------------------------------------------
CREATE TABLE users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,            -- password_hash() output only, never plaintext
  display_name  VARCHAR(100) NOT NULL,
  streak_count  INT UNSIGNED NOT NULL DEFAULT 0,
  best_streak   INT UNSIGNED NOT NULL DEFAULT 0,     -- longest streak ever, kept across resets
  streak_freezes TINYINT UNSIGNED NOT NULL DEFAULT 0, -- each covers one missed day; earned every 7 days, max 2
  rest_days     TINYINT UNSIGNED NOT NULL DEFAULT 0, -- weekdays that never break the streak: bit 0 = Monday ... bit 6 = Sunday
  daily_capacity_min SMALLINT UNSIGNED NOT NULL DEFAULT 240, -- realistic minutes available on a normal day
  digest_enabled TINYINT(1)  NOT NULL DEFAULT 0,     -- morning email of the day's plan
  digest_time   CHAR(5)      NOT NULL DEFAULT '07:30', -- HH:MM, in the user's time zone
  timezone      VARCHAR(64)  NOT NULL DEFAULT '',    -- from the user's browser, e.g. 'Africa/Accra'; empty = the server's zone
  last_active_date DATE      NULL,                   -- drives streak_count
  avatar_updated_at DATETIME NULL,                   -- NULL = no profile photo; set when one is uploaded
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  CONSTRAINT chk_users_email CHECK (email LIKE '%_@_%._%')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------
CREATE TABLE categories (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(50)  NOT NULL,
  color_code CHAR(7)      NOT NULL DEFAULT '#6C757D',   -- hex, e.g. #4F46E5
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name),
  CONSTRAINT chk_categories_color CHECK (color_code REGEXP '^#[0-9A-Fa-f]{6}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- goals
-- ---------------------------------------------------------------
CREATE TABLE goals (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  title       VARCHAR(255) NOT NULL,
  category_id INT UNSIGNED NULL,
  priority    ENUM('HIGH','MEDIUM','LOW') NOT NULL DEFAULT 'MEDIUM',
  timeframe   ENUM('DAILY','WEEKLY','MONTHLY','SEMESTER','YEARLY') NOT NULL DEFAULT 'DAILY',
  due_date    DATE NULL,
  quote       VARCHAR(500) NULL,                         -- motivational quote
  status      ENUM('ACTIVE','COMPLETED','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  completed_at TIMESTAMP NULL DEFAULT NULL,              -- set when every sub-plan is done
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_goals_user_status (user_id, status),
  KEY idx_goals_user_due (user_id, due_date),
  KEY idx_goals_category (category_id),
  CONSTRAINT fk_goals_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_goals_category
    FOREIGN KEY (category_id) REFERENCES categories (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- sub_plans
-- ---------------------------------------------------------------
CREATE TABLE sub_plans (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  goal_id          INT UNSIGNED NOT NULL,
  task_description VARCHAR(500) NOT NULL,
  is_completed     TINYINT(1)   NOT NULL DEFAULT 0,
  remind_at        DATETIME     NULL,
  estimate_min     SMALLINT UNSIGNED NULL,              -- how long the task should take, in minutes
  PRIMARY KEY (id),
  KEY idx_sub_plans_goal (goal_id, is_completed),
  KEY idx_sub_plans_remind (remind_at),
  CONSTRAINT fk_sub_plans_goal
    FOREIGN KEY (goal_id) REFERENCES goals (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_sub_plans_completed CHECK (is_completed IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------
CREATE TABLE reviews (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  goal_id               INT UNSIGNED NOT NULL,
  completion_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  reward_badge_tier     ENUM('NONE','BRONZE','SILVER','GOLD','PLATINUM') NOT NULL DEFAULT 'NONE',
  reviewed_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reviews_goal_date (goal_id, reviewed_at),
  CONSTRAINT fk_reviews_goal
    FOREIGN KEY (goal_id) REFERENCES goals (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_reviews_pct CHECK (completion_percentage BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- password_resets (forgotten-password links)
-- ---------------------------------------------------------------
CREATE TABLE password_resets (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  token_hash CHAR(64)     NOT NULL,                 -- sha256 of the emailed token; the token itself is never stored
  expires_at DATETIME     NOT NULL,
  used_at    DATETIME     NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_resets_hash (token_hash),
  KEY idx_resets_user (user_id, created_at),
  CONSTRAINT fk_resets_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- push_subscriptions (one row per device that agreed to notifications)
-- ---------------------------------------------------------------
CREATE TABLE push_subscriptions (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED NOT NULL,
  endpoint_hash CHAR(64)     NOT NULL,                  -- sha256 of the endpoint, so it can be unique
  endpoint      TEXT         NOT NULL,
  p256dh        VARCHAR(255) NOT NULL,                  -- the device's public key (base64url)
  auth          VARCHAR(64)  NOT NULL,                  -- the device's auth secret (base64url)
  user_agent    VARCHAR(255) NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_push_endpoint (endpoint_hash),
  KEY idx_push_user (user_id),
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- notification_log (what has already been sent, so nothing goes out twice)
-- ---------------------------------------------------------------
CREATE TABLE notification_log (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  kind       VARCHAR(16)  NOT NULL,                     -- 'task' (a reminder push) or 'digest'
  ref_id     INT UNSIGNED NOT NULL DEFAULT 0,           -- the task id, or 0 for a digest
  stamp      VARCHAR(32)  NOT NULL,                     -- the reminder time, or the digest date
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_notification (user_id, kind, ref_id, stamp),
  KEY idx_notification_created (created_at),
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- Default categories
-- ---------------------------------------------------------------
INSERT INTO categories (name, color_code) VALUES
  ('School',   '#3B82F6'),
  ('Work',     '#F59E0B'),
  ('Church',   '#8B5CF6'),
  ('Daily',    '#10B981'),
  ('Weekly',   '#06B6D4'),
  ('Monthly',  '#EC4899'),
  ('Yearly',   '#EF4444'),
  ('Personal', '#14B8A6'),
  ('Others',   '#6B7280');
