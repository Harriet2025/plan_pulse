-- AuraGoal schema (MySQL 8.0.16+ required for CHECK constraints)

CREATE DATABASE IF NOT EXISTS auragoal
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE auragoal;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS journal_entries;
DROP TABLE IF EXISTS partner_shares;
DROP TABLE IF EXISTS partner_messages;
DROP TABLE IF EXISTS partnerships;
DROP TABLE IF EXISTS notification_log;
DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS password_resets;
DROP TABLE IF EXISTS day_plan_marks;
DROP TABLE IF EXISTS day_plans;
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
  user_id    INT UNSIGNED NULL,                         -- NULL = built in for everyone; else a personal category
  name       VARCHAR(50)  NOT NULL,
  color_code CHAR(7)      NOT NULL DEFAULT '#6C757D',   -- hex, e.g. #4F46E5
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_owner_name (user_id, name),
  CONSTRAINT fk_categories_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
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
  timeframe   ENUM('WEEKLY','MONTHLY','YEARLY') NOT NULL DEFAULT 'WEEKLY',  -- the horizon: a goal for a week, month or year
  due_date    DATE NULL,                                 -- places the goal in its period (the week, month or year containing it)
  quote       VARCHAR(500) NULL,                         -- motivational quote
  is_private  TINYINT(1) NOT NULL DEFAULT 0,             -- hidden from accountability partners
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
  completed_at     DATETIME     NULL,                   -- when it was ticked, for the partners' weekly scoreboard
  remind_at        DATETIME     NULL,                   -- unused since migration 009 (times live on day_plans)
  estimate_min     SMALLINT UNSIGNED NULL,              -- how long it takes in minutes, for "What should I do now?"
  PRIMARY KEY (id),
  KEY idx_sub_plans_goal (goal_id, is_completed),
  KEY idx_sub_plans_remind (remind_at),
  CONSTRAINT fk_sub_plans_goal
    FOREIGN KEY (goal_id) REFERENCES goals (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_sub_plans_completed CHECK (is_completed IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- day_plans (a day's own plans; they do not belong to a goal)
-- ---------------------------------------------------------------
CREATE TABLE day_plans (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NOT NULL,
  title        VARCHAR(255) NOT NULL,
  plan_date    DATE         NOT NULL,                  -- the day, or the first day of a repeating plan
  start_time   TIME         NULL,                      -- NULL = any time that day
  duration_min SMALLINT UNSIGNED NULL,                 -- how long it takes, 5 to 720 minutes
  repeat_rule  ENUM('NONE','DAILY','WEEKLY','MONTHLY') NOT NULL DEFAULT 'NONE',
  repeat_days  TINYINT UNSIGNED NOT NULL DEFAULT 0,    -- WEEKLY: bit 0 = Monday ... bit 6 = Sunday
  repeat_until DATE         NULL,                      -- last day a repeating plan happens; NULL = no end
  is_private   TINYINT(1)   NOT NULL DEFAULT 0,        -- hidden from accountability partners
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_day_plans_user_date (user_id, plan_date),
  CONSTRAINT fk_day_plans_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Which days a plan was done, or skipped (one day of a repeating plan)
CREATE TABLE day_plan_marks (
  day_plan_id INT UNSIGNED NOT NULL,
  on_date     DATE         NOT NULL,
  state       ENUM('DONE','SKIPPED') NOT NULL,
  marked_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (day_plan_id, on_date),
  CONSTRAINT fk_day_plan_marks_plan FOREIGN KEY (day_plan_id) REFERENCES day_plans (id) ON DELETE CASCADE ON UPDATE CASCADE
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
-- Accountability partners: an invite to an email address, accepted by whoever has it; then a shared chat
-- ---------------------------------------------------------------
CREATE TABLE partnerships (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  inviter_id      INT UNSIGNED NOT NULL,
  invitee_email   VARCHAR(255) NOT NULL,              -- as typed (lower case); matched when that person signs in
  invitee_id      INT UNSIGNED NULL,                  -- set when the invite is accepted
  status          ENUM('PENDING','ACCEPTED') NOT NULL DEFAULT 'PENDING',
  inviter_read_id INT UNSIGNED NOT NULL DEFAULT 0,     -- the last message each side has seen, for unread counts
  invitee_read_id INT UNSIGNED NOT NULL DEFAULT 0,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at     TIMESTAMP    NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_partnership_invite (inviter_id, invitee_email),
  KEY idx_partnership_email (invitee_email),
  KEY idx_partnership_invitee (invitee_id),
  CONSTRAINT fk_partnership_inviter FOREIGN KEY (inviter_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_partnership_invitee FOREIGN KEY (invitee_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE partner_messages (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  partnership_id INT UNSIGNED NOT NULL,
  sender_id      INT UNSIGNED NOT NULL,
  kind           ENUM('TEXT','CHEER','NUDGE','IMAGE','VIDEO') NOT NULL DEFAULT 'TEXT',
  body           VARCHAR(1000) NOT NULL,             -- the text, or the cheer's emoji
  ref_goal_id    INT UNSIGNED NULL,                  -- the goal a cheer is for
  media_file     VARCHAR(80)  NULL,                  -- a photo or video: its file name inside storage/chat/<partnership id>/
  media_mime     VARCHAR(40)  NULL,
  media_w        SMALLINT UNSIGNED NULL,             -- image size, so the chat keeps its place while it loads
  media_h        SMALLINT UNSIGNED NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_messages_partnership (partnership_id, id),
  KEY idx_messages_sender (sender_id, created_at),
  CONSTRAINT fk_messages_partnership FOREIGN KEY (partnership_id) REFERENCES partnerships (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_messages_goal FOREIGN KEY (ref_goal_id) REFERENCES goals (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Which of the owner's categories a partner may see (category_id 0 = the owner's day plans). Nothing until chosen.
CREATE TABLE partner_shares (
  partnership_id INT UNSIGNED NOT NULL,
  owner_id       INT UNSIGNED NOT NULL,
  category_id    INT UNSIGNED NOT NULL,
  PRIMARY KEY (partnership_id, owner_id, category_id),
  CONSTRAINT fk_shares_partnership FOREIGN KEY (partnership_id) REFERENCES partnerships (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_shares_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- journal_entries: a private diary (notes, reflections on a week / month / year, reflections on goals)
-- ---------------------------------------------------------------
CREATE TABLE journal_entries (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  kind        ENUM('NOTE','REVIEW','GOAL') NOT NULL DEFAULT 'NOTE',
  entry_date  DATE         NOT NULL,                 -- the day it is about (NOTE), or the day it was written
  period      ENUM('WEEKLY','MONTHLY','YEARLY') NULL, -- REVIEW: which kind of period
  period_key  DATE         NULL,                     -- REVIEW: the first day of that period
  goal_id     INT UNSIGNED NULL,                     -- GOAL: the goal reflected on
  title       VARCHAR(150) NULL,
  body        TEXT         NULL,                     -- free writing, up to 20 000 characters
  answers     JSON         NULL,                     -- guided prompts
  mood        TINYINT UNSIGNED NULL,                 -- 1 (hard) to 5 (great)
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_journal_user_date (user_id, entry_date),
  UNIQUE KEY uq_journal_goal (user_id, goal_id),                    -- one reflection per goal
  UNIQUE KEY uq_journal_review (user_id, kind, period, period_key), -- one reflection per period (NULLs never clash)
  CONSTRAINT fk_journal_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_journal_goal FOREIGN KEY (goal_id) REFERENCES goals (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_journal_mood CHECK (mood IS NULL OR mood BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- Default categories
-- ---------------------------------------------------------------
-- Life areas only (the ids match src/lib/constants.js). Day / Week / Month / Year are horizons, not categories.
INSERT INTO categories (id, name, color_code) VALUES
  (1,  'School',   '#3F6F9B'),
  (2,  'Work',     '#B38A3A'),
  (3,  'Church',   '#8A6E9B'),
  (8,  'Personal', '#3F8F83'),
  (9,  'Others',   '#8A7F76'),
  (10, 'Health',   '#5F8F6B'),
  (11, 'Family',   '#B8647D'),
  (12, 'Finance',  '#9A7B4F');
