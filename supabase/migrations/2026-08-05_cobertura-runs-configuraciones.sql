alter table raid_run_templates add column if not exists min_ilvl integer;

alter table raid_run_templates add column if not exists only_mains boolean not null default false;

create table if not exists raid_run_excluded_members (
  user_id uuid primary key references app_users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references app_users(id) on delete set null
);

create table if not exists raid_capacity_snapshot (
  id integer primary key default 1 check (id = 1),
  entries jsonb not null,
  computed_at timestamptz not null default now(),
  computed_by uuid references app_users(id) on delete set null
);

alter table raid_run_excluded_members enable row level security;
alter table raid_capacity_snapshot enable row level security;

drop policy if exists "no_public_access_raid_run_excluded_members" on raid_run_excluded_members;
drop policy if exists "no_public_access_raid_capacity_snapshot" on raid_capacity_snapshot;

create policy "no_public_access_raid_run_excluded_members" on raid_run_excluded_members for all using (false);
create policy "no_public_access_raid_capacity_snapshot" on raid_capacity_snapshot for all using (false);
