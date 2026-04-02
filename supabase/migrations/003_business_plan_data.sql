-- ============================================================
-- Business Plan Data (structured extraction from PDF)
-- ============================================================

CREATE TABLE business_plan_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  fiscal_year INT NOT NULL,
  mission TEXT,
  vision TEXT,
  value_statement TEXT,
  business_policies JSONB DEFAULT '[]'::jsonb,
  financial_plan JSONB DEFAULT '{}'::jsonb,
  investment_plan JSONB DEFAULT '[]'::jsonb,
  personnel_plan JSONB DEFAULT '[]'::jsonb,
  schedule JSONB DEFAULT '[]'::jsonb,
  raw_extraction JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, fiscal_year)
);

CREATE INDEX idx_business_plan_data_project ON business_plan_data(project_id);

CREATE TRIGGER trg_business_plan_data_updated_at
  BEFORE UPDATE ON business_plan_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE business_plan_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view" ON business_plan_data
  FOR SELECT USING (is_project_member(project_id));

CREATE POLICY "Consultants and admins can manage" ON business_plan_data
  FOR ALL USING (get_project_role(project_id) IN ('consultant', 'company_admin'));

-- ============================================================
-- Extend strategies table with strategy_type
-- ============================================================

ALTER TABLE strategies ADD COLUMN IF NOT EXISTS strategy_type TEXT DEFAULT 'business'
  CHECK (strategy_type IN ('business', 'functional', 'other'));
