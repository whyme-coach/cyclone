-- Department profiles for storing extracted past-year data and profile info
CREATE TABLE IF NOT EXISTS department_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  description TEXT,
  strengths JSONB,
  challenges JSONB,
  technologies JSONB,
  previous_year_summary JSONB,
  previous_year_initiatives JSONB,
  headcount JSONB,
  next_year_focus JSONB,
  raw_extraction JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_department_profiles_dept ON department_profiles(department_id);

CREATE TRIGGER trg_dept_profiles_updated_at BEFORE UPDATE ON department_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
