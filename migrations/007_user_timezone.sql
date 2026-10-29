-- Each user's own time zone (from their browser), so reminders, the morning email and streak days happen on their
-- clock rather than the server's. Run ONCE on an existing database; fresh installs of schema.sql already have it.

USE auragoal;

ALTER TABLE users
  ADD COLUMN timezone VARCHAR(64) NOT NULL DEFAULT '' AFTER digest_time;   -- e.g. 'Africa/Accra'; empty = the server's zone
