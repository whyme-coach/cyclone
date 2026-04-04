-- Add WOOP coaching summary to action_plans
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS woop_summary JSONB;
