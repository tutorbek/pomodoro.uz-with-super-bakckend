-- Migration V4: Create ai_insights table

CREATE TABLE ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    focus_score INT NOT NULL DEFAULT 0,
    peak_hours VARCHAR(100),
    burnout_risk VARCHAR(50),
    summary_text TEXT,
    recommendations_json TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ai_insights_user_created ON ai_insights(user_id, created_at DESC);
