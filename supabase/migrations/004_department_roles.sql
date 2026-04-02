-- Add role and responsibilities to departments table
ALTER TABLE departments ADD COLUMN IF NOT EXISTS role_description TEXT;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS responsibilities JSONB DEFAULT '[]'::jsonb;
