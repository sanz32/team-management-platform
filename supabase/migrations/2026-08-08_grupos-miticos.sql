create table if not exists mythic_plus_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references app_users(id),
  archived_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists mythic_plus_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references mythic_plus_groups(id) on delete cascade not null,
  character_id uuid references characters(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (group_id, character_id)
);

create table if not exists mythic_plus_group_runs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references mythic_plus_groups(id) on delete cascade not null,
  source text not null check (source in ('raiderio', 'wcl')),
  source_run_id text not null,
  dungeon_name text,
  keystone_level int,
  keystone_upgrades int not null default 0,
  clear_time_ms int,
  completed_at timestamptz not null,
  matched_count int not null,
  roster jsonb,
  avg_ilvl numeric,
  created_at timestamptz default now(),
  unique (group_id, source, source_run_id)
);

create table if not exists mythic_plus_raiderio_cursors (
  character_id uuid primary key references characters(id) on delete cascade,
  last_run_id bigint,
  last_checked_at timestamptz
);

alter table mythic_plus_groups enable row level security;
alter table mythic_plus_group_members enable row level security;
alter table mythic_plus_group_runs enable row level security;
alter table mythic_plus_raiderio_cursors enable row level security;

drop policy if exists "no_public_access_mythic_plus_groups" on mythic_plus_groups;
drop policy if exists "no_public_access_mythic_plus_group_members" on mythic_plus_group_members;
drop policy if exists "no_public_access_mythic_plus_group_runs" on mythic_plus_group_runs;
drop policy if exists "no_public_access_mythic_plus_raiderio_cursors" on mythic_plus_raiderio_cursors;

create policy "no_public_access_mythic_plus_groups" on mythic_plus_groups for all using (false);
create policy "no_public_access_mythic_plus_group_members" on mythic_plus_group_members for all using (false);
create policy "no_public_access_mythic_plus_group_runs" on mythic_plus_group_runs for all using (false);
create policy "no_public_access_mythic_plus_raiderio_cursors" on mythic_plus_raiderio_cursors for all using (false);

create index if not exists idx_mythic_plus_group_members_group_id on mythic_plus_group_members(group_id);
create index if not exists idx_mythic_plus_group_runs_group_id on mythic_plus_group_runs(group_id, completed_at desc);
