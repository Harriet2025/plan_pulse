-- Stage 6 upgrade for databases created from the Stage 1 schema.sql.
-- Run ONCE in phpMyAdmin or the mysql client. Fresh installs of the updated schema.sql do not need it.

USE auragoal;

ALTER TABLE users
  ADD COLUMN last_active_date DATE NULL AFTER streak_count;

ALTER TABLE goals
  ADD COLUMN completed_at TIMESTAMP NULL DEFAULT NULL AFTER status,
  ADD KEY idx_goals_user_history (user_id, status, completed_at);

-- Optional: mark goals whose tasks are all done as completed (uses their last update time).
UPDATE goals g
SET g.status = 'COMPLETED', g.completed_at = g.updated_at
WHERE g.status = 'ACTIVE'
  AND EXISTS (SELECT 1 FROM sub_plans s WHERE s.goal_id = g.id)
  AND NOT EXISTS (SELECT 1 FROM sub_plans s WHERE s.goal_id = g.id AND s.is_completed = 0);
