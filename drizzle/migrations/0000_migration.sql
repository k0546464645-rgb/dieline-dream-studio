create type public.app_role as enum ('studio');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- First two accounts become studio members automatically
create or replace function public.grant_studio_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.user_roles where role = 'studio') < 2 then
    insert into public.user_roles (user_id, role) values (new.id, 'studio') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger on_auth_user_created_studio after insert on auth.users
for each row execute function public.grant_studio_role();

create table public.style_guides (
  id uuid primary key default gen_random_uuid(),
  created_by uuid default auth.uid(),
  name text not null,
  brand text not null default '',
  kind text not null default 'generated',
  colors text not null default '',
  fonts text not null default '',
  imagery text not null default '',
  directions text not null default '',
  notes text not null default '',
  image_paths text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  created_by uuid default auth.uid(),
  name text not null,
  customer_name text not null default '',
  customer_email text not null default '',
  customer_phone text not null default '',
  supplier text not null default '',
  supplier_item text not null default '',
  stage text not null default 'concept',
  status text not null default 'draft',
  style_guide_id uuid references public.style_guides(id) on delete set null,
  messages jsonb not null default '[]',
  approved_concept text not null default '',
  info jsonb not null default '{}',
  style_notes text not null default '',
  product_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null,
  label text not null default '',
  path text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  stage text not null,
  recipient_name text not null default '',
  recipient_role text not null default 'customer',
  message text not null default '',
  items jsonb not null default '[]',
  status text not null default 'pending',
  chosen text,
  comment text not null default '',
  marks jsonb not null default '[]',
  responder_name text not null default '',
  responded_at timestamptz,
  applied boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null default 'note',
  message text not null,
  actor text not null default '',
  created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['style_guides','projects','project_files','approvals','activity'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "studio full access" on public.%I for all to authenticated using (public.has_role(auth.uid(), ''studio'')) with check (public.has_role(auth.uid(), ''studio''))', t);
  end loop;
end $$;

create index on public.project_files(project_id);
create index on public.approvals(project_id);
create index on public.activity(project_id, created_at desc);