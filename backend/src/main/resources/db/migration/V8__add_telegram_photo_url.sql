-- Migration V8: Add telegram_photo_url column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_photo_url TEXT;
