create table if not exists guild_points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade not null,
  created_by uuid references app_users(id) on delete set null,
  points integer not null default 1 check (points > 0),
  scope text not null check (scope in ('week', 'run')),
  reason text,
  wcl_report_code text,
  wcl_fight_id integer,
  wcl_boss_name text,
  wcl_kill boolean,
  evidence_path text,
  percent numeric(5,2) not null default 10 check (percent > 0),
  week_start date not null,
  created_at timestamptz not null default now()
);

create table if not exists guild_points_evidence_cleanup_state (
  key text primary key default 'singleton',
  checked_at timestamptz not null default now()
);

alter table guild_points enable row level security;
alter table guild_points_evidence_cleanup_state enable row level security;

drop policy if exists "no_public_access_guild_points" on guild_points;
drop policy if exists "no_public_access_guild_points_evidence_cleanup_state" on guild_points_evidence_cleanup_state;

create policy "no_public_access_guild_points" on guild_points for all using (false);
create policy "no_public_access_guild_points_evidence_cleanup_state" on guild_points_evidence_cleanup_state for all using (false);

create index if not exists idx_guild_points_user_week on guild_points(user_id, week_start desc);
create index if not exists idx_guild_points_week on guild_points(week_start desc);

