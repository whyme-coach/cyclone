-- KPI to Measure many-to-many links
CREATE TABLE IF NOT EXISTS kpi_measure_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id UUID NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
  measure_id UUID NOT NULL REFERENCES measures(id) ON DELETE CASCADE,
  UNIQUE(kpi_id, measure_id)
);

CREATE INDEX idx_kpi_measure_links_kpi ON kpi_measure_links(kpi_id);
CREATE INDEX idx_kpi_measure_links_measure ON kpi_measure_links(measure_id);

ALTER TABLE kpi_measure_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view kpi_measure_links" ON kpi_measure_links
  FOR SELECT USING (EXISTS (SELECT 1 FROM kpis k WHERE k.id = kpi_id AND is_project_member(k.project_id)));

CREATE POLICY "Members can manage kpi_measure_links" ON kpi_measure_links
  FOR ALL USING (EXISTS (SELECT 1 FROM kpis k WHERE k.id = kpi_id AND get_project_role(k.project_id) IN ('consultant', 'company_admin', 'department_manager')));
