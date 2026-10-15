CREATE TABLE public.project_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  info JSONB NOT NULL DEFAULT '{}'::jsonb,
  product_path TEXT,
  notes TEXT NOT NULL DEFAULT '',
  sort INT NOT NULL DEFAULT 0,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_items TO authenticated;
GRANT ALL ON public.project_items TO service_role;
ALTER TABLE public.project_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "studio full access" ON public.project_items FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'studio')) WITH CHECK (public.has_role(auth.uid(), 'studio'));