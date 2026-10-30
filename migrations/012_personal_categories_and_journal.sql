-- AuraGoal migration 012: personal categories, goal reflections and the journal.
--
-- * categories.user_id: NULL for the built-in categories everyone has, or the owner of a personal category
--   ("Content creation", "Side hustle"...). Names are unique per owner.
-- * journal_entries: a private diary (never shared with partners). Three kinds:
--     NOTE   a note for a day
--     REVIEW a reflection on a week, month or year (period + period_key, the period's first day)
--     GOAL   a reflection on a goal (goal_id), usually written when it is completed
--   `answers` holds the guided prompts as JSON ({"went": "...", "lessons": "..."}); `body` is free writing.
--
-- Run once on a database that already has migration 011.

USE auragoal;

ALTER TABLE categories
  ADD COLUMN user_id INT UNSIGNED NULL AFTER id,
  DROP INDEX uq_categories_name,
  ADD UNIQUE KEY uq_categories_owner_name (user_id, name),
  ADD CONSTRAINT fk_categories_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE;

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
