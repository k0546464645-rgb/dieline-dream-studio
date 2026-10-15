CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid DEFAULT auth.uid(),
  name text NOT NULL,
  contact_name text NOT NULL DEFAULT ''::text,
  email text NOT NULL DEFAULT ''::text,
  phone text NOT NULL DEFAULT ''::text,
  notes text NOT NULL DEFAULT ''::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "studio full access" ON public.customers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'studio'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'studio'::app_role));