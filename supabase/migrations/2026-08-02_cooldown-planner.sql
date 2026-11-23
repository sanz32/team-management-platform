create table if not exists cooldown_spell_library (
  spell_id int primary key,
  name text not null,
  icon_url text,
  class text not null,
  spec text,
  category text check (category in ('raid_cd', 'external', 'personal_defensive', 'utility', 'offensive')),
  duration_seconds int,
  is_active boolean not null default true,
  is_categorized boolean not null default false,
  source text not null check (source in ('talent_api', 'simc_dump', 'manual')),
  synced_at timestamptz default now()
);

create table if not exists reference_log_imports (
  id uuid primary key default gen_random_uuid(),
  wcl_report_code text not null,
  wcl_fight_id int not null,
  boss_id uuid references raid_bosses(id) not null,
  difficulty text,
  source_guild_name text,
  imported_by uuid references app_users(id),
  imported_at timestamptz default now(),
  pull_duration_ms int
);

create table if not exists reference_boss_events (
  id uuid primary key default gen_random_uuid(),
  reference_log_id uuid references reference_log_imports(id) on delete cascade not null,
  spell_id int not null,
  spell_name text not null,
  timestamp_ms int not null,
  phase text
);

create table if not exists reference_cooldown_casts (
  id uuid primary key default gen_random_uuid(),
  reference_log_id uuid references reference_log_imports(id) on delete cascade not null,
  spell_id int references cooldown_spell_library(spell_id) not null,
  caster_name text not null,
  caster_class text,
  caster_spec text,
  timestamp_ms int not null
);

create table if not exists cooldown_plans (
  id uuid primary key default gen_random_uuid(),
  boss_id uuid references raid_bosses(id) not null,
  name text not null,
  created_by uuid references app_users(id),
  based_on_reference_log_id uuid references reference_log_imports(id),
  updated_at timestamptz default now()
);

create table if not exists cooldown_plan_assignments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references cooldown_plans(id) on delete cascade not null,
  spell_id int references cooldown_spell_library(spell_id) not null,
  assigned_character_id uuid references characters(id),
  planned_timestamp_ms int not null,
  source text not null default 'manual' check (source in ('manual', 'imported_from_reference')),
  reference_cast_id uuid references reference_cooldown_casts(id)
);

alter table cooldown_spell_library enable row level security;
alter table reference_log_imports enable row level security;
alter table reference_boss_events enable row level security;
alter table reference_cooldown_casts enable row level security;
alter table cooldown_plans enable row level security;
alter table cooldown_plan_assignments enable row level security;

drop policy if exists "no_public_access_cooldown_spell_library" on cooldown_spell_library;
drop policy if exists "no_public_access_reference_log_imports" on reference_log_imports;
drop policy if exists "no_public_access_reference_boss_events" on reference_boss_events;
drop policy if exists "no_public_access_reference_cooldown_casts" on reference_cooldown_casts;
drop policy if exists "no_public_access_cooldown_plans" on cooldown_plans;
drop policy if exists "no_public_access_cooldown_plan_assignments" on cooldown_plan_assignments;

create policy "no_public_access_cooldown_spell_library" on cooldown_spell_library for all using (false);
create policy "no_public_access_reference_log_imports" on reference_log_imports for all using (false);
create policy "no_public_access_reference_boss_events" on reference_boss_events for all using (false);
create policy "no_public_access_reference_cooldown_casts" on reference_cooldown_casts for all using (false);
create policy "no_public_access_cooldown_plans" on cooldown_plans for all using (false);
create policy "no_public_access_cooldown_plan_assignments" on cooldown_plan_assignments for all using (false);

create index if not exists idx_reference_log_imports_boss_id on reference_log_imports(boss_id);
create index if not exists idx_reference_boss_events_log_id on reference_boss_events(reference_log_id);
create index if not exists idx_reference_cooldown_casts_log_id on reference_cooldown_casts(reference_log_id);
create index if not exists idx_cooldown_plans_boss_id on cooldown_plans(boss_id);
create index if not exists idx_cooldown_plan_assignments_plan_id on cooldown_plan_assignments(plan_id);
create index if not exists idx_cooldown_spell_library_is_categorized on cooldown_spell_library(is_categorized) where is_categorized = false;
