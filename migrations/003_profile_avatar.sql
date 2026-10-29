-- Profile photos: adds users.avatar_updated_at (NULL = no photo). Run ONCE on an existing database.
-- Fresh installs of the updated schema.sql already include the column.

USE auragoal;

ALTER TABLE users
  ADD COLUMN avatar_updated_at DATETIME NULL AFTER last_active_date;
