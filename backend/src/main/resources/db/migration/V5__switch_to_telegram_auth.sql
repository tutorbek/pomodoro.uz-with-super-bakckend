-- Migration V5: Switch authentication from Google OAuth to Telegram Auth

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ADD COLUMN telegram_id BIGINT UNIQUE;
ALTER TABLE users ADD COLUMN username VARCHAR(255);
ALTER TABLE users ALTER COLUMN provider SET DEFAULT 'telegram';

CREATE INDEX idx_users_telegram_id ON users(telegram_id);
