-- Rest days, streak freezes and best streak. Run ONCE on an existing database.
-- Fresh installs of the updated schema.sql already include these columns.

USE auragoal;

ALTER TABLE users
  ADD COLUMN best_streak    INT UNSIGNED     NOT NULL DEFAULT 0 AFTER streak_count,
  ADD COLUMN streak_freezes TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER best_streak,
  ADD COLUMN rest_days      TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER streak_freezes;  -- bit 0 = Monday ... bit 6 = Sunday

UPDATE users SET best_streak = streak_count;
