-- Add kpi_id column to action_plans for KPI-driven action planning
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS kpi_id UUID REFERENCES kpis(id) ON DELETE SET NULL;
