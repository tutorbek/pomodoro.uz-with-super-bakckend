ALTER TABLE pomodoro_sessions ADD COLUMN task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
CREATE INDEX idx_sessions_task_id ON pomodoro_sessions(task_id);
