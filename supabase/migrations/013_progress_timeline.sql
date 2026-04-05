-- Extend progress_reports with new fields
ALTER TABLE progress_reports ADD COLUMN IF NOT EXISTS planned_actions TEXT;
ALTER TABLE progress_reports ADD COLUMN IF NOT EXISTS challenges TEXT;
ALTER TABLE progress_reports ADD COLUMN IF NOT EXISTS next_action_deadline DATE;

-- Timeline posts
CREATE TABLE IF NOT EXISTS timeline_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  post_type TEXT NOT NULL CHECK (post_type IN ('weekly_report', 'monthly_report', 'plan_change')),
  title TEXT NOT NULL,
  content TEXT,
  metadata JSONB,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_posts_project ON timeline_posts(project_id);
CREATE INDEX IF NOT EXISTS idx_timeline_posts_dept ON timeline_posts(department_id);

-- Timeline comments
CREATE TABLE IF NOT EXISTS timeline_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES timeline_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_comments_post ON timeline_comments(post_id);
