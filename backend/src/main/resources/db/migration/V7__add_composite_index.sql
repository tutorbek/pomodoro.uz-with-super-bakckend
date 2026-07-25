-- Migration V7: Add composite index on pomodoro_sessions (user_id, completed, started_at)

CREATE INDEX IF NOT EXISTS idx_sessions_user_completed_started ON pomodoro_sessions(user_id, completed, started_at);
