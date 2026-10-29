-- AuraGoal migration 011: choose what each partner sees, and photos / videos in the chat.
--
-- * partner_shares: for each partnership, which of the owner's categories the partner may see (category_id 0 means
--   the owner's day plans). Nothing is shared until the owner picks something.
-- * partner_messages: IMAGE and VIDEO messages. The file lives in storage/chat/<partnership id>/ and is only served
--   to the two partners by api/chat_media.php; `body` holds an optional caption.
--
-- Run once on a database that already has migration 010.

USE auragoal;

CREATE TABLE partner_shares (
  partnership_id INT UNSIGNED NOT NULL,
  owner_id       INT UNSIGNED NOT NULL,                -- whose goals or day plans
  category_id    INT UNSIGNED NOT NULL,                -- a category id, or 0 for day plans
  PRIMARY KEY (partnership_id, owner_id, category_id),
  CONSTRAINT fk_shares_partnership FOREIGN KEY (partnership_id) REFERENCES partnerships (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_shares_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE partner_messages
  MODIFY kind ENUM('TEXT','CHEER','NUDGE','IMAGE','VIDEO') NOT NULL DEFAULT 'TEXT',
  ADD COLUMN media_file VARCHAR(80) NULL AFTER ref_goal_id,   -- file name inside storage/chat/<partnership id>/
  ADD COLUMN media_mime VARCHAR(40) NULL AFTER media_file,
  ADD COLUMN media_w SMALLINT UNSIGNED NULL AFTER media_mime,  -- image size, so the chat can keep its place while it loads
  ADD COLUMN media_h SMALLINT UNSIGNED NULL AFTER media_w;
