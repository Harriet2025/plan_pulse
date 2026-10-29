-- Horizons and life-area categories. Run ONCE on an existing database; fresh installs of schema.sql already match.
--
-- Day / Week / Month / Year are no longer categories: they are the goal's horizon (goals.timeframe), and every goal
-- belongs to one specific period, the one that contains its due date. Categories are life areas only.

USE auragoal;

-- 1. Goals filed under a time-based category move to Others, keeping that time as their horizon
UPDATE goals SET timeframe = 'DAILY',   category_id = 9 WHERE category_id = 4;
UPDATE goals SET timeframe = 'WEEKLY',  category_id = 9 WHERE category_id = 5;
UPDATE goals SET timeframe = 'MONTHLY', category_id = 9 WHERE category_id = 6;
UPDATE goals SET timeframe = 'YEARLY',  category_id = 9 WHERE category_id = 7;
DELETE FROM categories WHERE id IN (4, 5, 6, 7);
INSERT INTO categories (id, name, color_code) VALUES
  (10, 'Health',  '#5F8F6B'),
  (11, 'Family',  '#B8647D'),
  (12, 'Finance', '#9A7B4F');

-- 2. Semester goals become Month goals, and Semester is no longer a horizon
UPDATE goals SET timeframe = 'MONTHLY' WHERE timeframe = 'SEMESTER';
ALTER TABLE goals MODIFY timeframe ENUM('DAILY','WEEKLY','MONTHLY','YEARLY') NOT NULL DEFAULT 'WEEKLY';

-- 3. Every active goal needs a due date, because that is what places it in its period (weeks run Monday to Sunday)
UPDATE goals SET due_date = CURDATE()                                              WHERE status = 'ACTIVE' AND due_date IS NULL AND timeframe = 'DAILY';
UPDATE goals SET due_date = CURDATE() + INTERVAL (6 - WEEKDAY(CURDATE())) DAY      WHERE status = 'ACTIVE' AND due_date IS NULL AND timeframe = 'WEEKLY';
UPDATE goals SET due_date = LAST_DAY(CURDATE())                                    WHERE status = 'ACTIVE' AND due_date IS NULL AND timeframe = 'MONTHLY';
UPDATE goals SET due_date = MAKEDATE(YEAR(CURDATE()), 1) + INTERVAL 1 YEAR - INTERVAL 1 DAY WHERE status = 'ACTIVE' AND due_date IS NULL AND timeframe = 'YEARLY';
