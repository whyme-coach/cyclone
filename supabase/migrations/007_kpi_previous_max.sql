-- Add previous year max value column to kpis table
ALTER TABLE kpis ADD COLUMN IF NOT EXISTS previous_year_max NUMERIC;
