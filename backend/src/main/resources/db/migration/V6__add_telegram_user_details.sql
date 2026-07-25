-- Migration V6: Add phone_number, first_name, last_name, and language_code columns to users table

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS language_code VARCHAR(10);

CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number);
