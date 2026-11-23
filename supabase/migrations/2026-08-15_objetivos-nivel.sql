alter table characters add column if not exists level int;

alter table guild_goals add column if not exists deadline_offset_minutes integer;

create table if not exists guild_goal_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade not null,
  goal_type text not null check (goal_type in ('characters', 'avg_ilvl')),
  week_start date not null,
  deadline_at timestamptz not null,
  target integer not null,
  current_value integer not null,
  met boolean not null,
  created_at timestamptz default now(),
  unique (user_id, goal_type, week_start)
);

create index if not exists guild_goal_history_user_idx
  on guild_goal_history (user_id, goal_type, week_start desc);

create table if not exists goal_close_state (
  key text primary key default 'singleton',
  checked_at timestamptz not null default now()
);
