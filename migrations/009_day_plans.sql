-- AuraGoal migration 009: goals are for a week, a month or a year; a day is a list of stand-alone plans.
--
-- * New table day_plans: things to do on a day, optionally at a time, optionally repeating
--   (every day, on chosen weekdays, or monthly). They do not belong to a goal.
-- * New table day_plan_marks: which days a plan was done (or skipped, for one day of a repeating plan).
-- * Every Day goal becomes day plans: its plans keep their times, or the goal itself becomes one plan when it had none.
--   Archived Day goals become Week goals instead, so History keeps them.
-- * Goal plans that had a time are copied onto the day, then lose the time (a goal's plans are a checklist).
-- * goals.timeframe becomes WEEKLY / MONTHLY / YEARLY.
--
-- Run once on a database that already has migration 008.

USE auragoal;

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
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  src_sub_plan INT UNSIGNED NULL,                      -- only while this migration runs
  PRIMARY KEY (id),
  KEY idx_day_plans_user_date (user_id, plan_date),
  CONSTRAINT fk_day_plans_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE day_plan_marks (
  day_plan_id INT UNSIGNED NOT NULL,
  on_date     DATE         NOT NULL,
  state       ENUM('DONE','SKIPPED') NOT NULL,
  marked_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (day_plan_id, on_date),
  CONSTRAINT fk_day_plan_marks_plan FOREIGN KEY (day_plan_id) REFERENCES day_plans (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Archived Day goals stay in History as Week goals
UPDATE goals SET timeframe = 'WEEKLY' WHERE timeframe = 'DAILY' AND status = 'ARCHIVED';

-- The plans of Day goals, and the timed plans of longer goals, become day plans
INSERT INTO day_plans (user_id, title, plan_date, start_time, duration_min, src_sub_plan)
SELECT g.user_id, LEFT(sp.task_description, 255), COALESCE(DATE(sp.remind_at), g.due_date, DATE(g.created_at)),
       TIME(sp.remind_at), sp.estimate_min, sp.id
FROM sub_plans sp JOIN goals g ON g.id = sp.goal_id
WHERE g.timeframe = 'DAILY' OR sp.remind_at IS NOT NULL;

-- A Day goal with no plans becomes one plan for that day
INSERT INTO day_plans (user_id, title, plan_date)
SELECT g.user_id, g.title, COALESCE(g.due_date, DATE(g.created_at))
FROM goals g
WHERE g.timeframe = 'DAILY' AND NOT EXISTS (SELECT 1 FROM sub_plans sp WHERE sp.goal_id = g.id);

-- Finished ones stay finished
INSERT INTO day_plan_marks (day_plan_id, on_date, state)
SELECT dp.id, dp.plan_date, 'DONE' FROM day_plans dp JOIN sub_plans sp ON sp.id = dp.src_sub_plan WHERE sp.is_completed = 1;

UPDATE sub_plans SET remind_at = NULL WHERE remind_at IS NOT NULL;
DELETE FROM goals WHERE timeframe = 'DAILY';

ALTER TABLE day_plans DROP COLUMN src_sub_plan;
ALTER TABLE goals MODIFY timeframe ENUM('WEEKLY','MONTHLY','YEARLY') NOT NULL DEFAULT 'WEEKLY';
