CREATE TABLE public.ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'chat',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ideas TO authenticated;
GRANT ALL ON public.ideas TO service_role;
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Studio can read ideas" ON public.ideas FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'studio'));
CREATE POLICY "Studio can insert ideas" ON public.ideas FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'studio'));
CREATE POLICY "Studio can update ideas" ON public.ideas FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'studio'));
CREATE POLICY "Studio can delete ideas" ON public.ideas FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'studio'));