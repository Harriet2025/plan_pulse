-- AuraGoal migration 010: accountability partners.
--
-- * partnerships: an invite from one user to an email address. It waits (PENDING) until someone with that email
--   accepts it, so an invite never reveals whether an address has an account. Then both see each other's goals and
--   day plans (except private ones) and can chat.
-- * partner_messages: the chat between two partners: text, cheers on a goal, and nudges.
-- * goals.is_private / day_plans.is_private: hidden from partners.
-- * sub_plans.completed_at: when a goal's plan was ticked, for the weekly scoreboard.
--
-- Run once on a database that already has migration 009.

USE auragoal;

ALTER TABLE goals ADD COLUMN is_private TINYINT(1) NOT NULL DEFAULT 0 AFTER quote;
ALTER TABLE day_plans ADD COLUMN is_private TINYINT(1) NOT NULL DEFAULT 0 AFTER repeat_until;
ALTER TABLE sub_plans ADD COLUMN completed_at DATETIME NULL AFTER is_completed;

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
  kind           ENUM('TEXT','CHEER','NUDGE') NOT NULL DEFAULT 'TEXT',
  body           VARCHAR(1000) NOT NULL,             -- the text, or the cheer's emoji
  ref_goal_id    INT UNSIGNED NULL,                  -- the goal a cheer is for
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_messages_partnership (partnership_id, id),
  KEY idx_messages_sender (sender_id, created_at),
  CONSTRAINT fk_messages_partnership FOREIGN KEY (partnership_id) REFERENCES partnerships (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_messages_goal FOREIGN KEY (ref_goal_id) REFERENCES goals (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
