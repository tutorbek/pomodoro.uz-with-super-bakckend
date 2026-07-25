CREATE TABLE pomodoro_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at  TIMESTAMPTZ NOT NULL,
    ended_at    TIMESTAMPTZ,
    duration    INTEGER NOT NULL DEFAULT 25,
    completed   BOOLEAN NOT NULL DEFAULT false,
    label       VARCHAR(100),
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sessions_user_id ON pomodoro_sessions(user_id);
CREATE INDEX idx_sessions_started_at ON pomodoro_sessions(started_at);
