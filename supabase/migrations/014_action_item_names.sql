-- Add free-text name fields for responsible/executor on action items
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS responsible_name TEXT;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS executor_name TEXT;
