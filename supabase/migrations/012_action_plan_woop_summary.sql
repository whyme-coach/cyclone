-- Add WOOP coaching summary and AI advice to action_plans
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS woop_summary JSONB;
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS ai_advice TEXT;
