-- Time estimates, daily capacity, the morning email, and push notifications. Run ONCE on an existing database.
-- Fresh installs of the updated schema.sql already include all of this.

USE auragoal;

ALTER TABLE sub_plans
  ADD COLUMN estimate_min SMALLINT UNSIGNED NULL AFTER remind_at;               -- how long the task should take, in minutes

ALTER TABLE users
  ADD COLUMN daily_capacity_min SMALLINT UNSIGNED NOT NULL DEFAULT 240 AFTER rest_days,   -- realistic minutes available on a normal day
  ADD COLUMN digest_enabled     TINYINT(1)        NOT NULL DEFAULT 0   AFTER daily_capacity_min,
  ADD COLUMN digest_time        CHAR(5)           NOT NULL DEFAULT '07:30' AFTER digest_enabled;  -- HH:MM, server time

-- One row per device that agreed to notifications
CREATE TABLE IF NOT EXISTS push_subscriptions (
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

-- What has already been sent, so a reminder or digest never goes out twice
CREATE TABLE IF NOT EXISTS notification_log (
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
