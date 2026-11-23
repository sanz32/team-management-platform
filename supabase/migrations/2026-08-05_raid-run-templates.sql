create table if not exists raid_run_templates (
  raid_key text not null,
  difficulty text not null check (difficulty in ('heroic', 'mythic')),
  tank_count integer not null default 2,
  heal_count integer not null default 4,
  dps_count integer not null default 11,
  max_same_class integer,
  updated_at timestamptz not null default now(),
  primary key (raid_key, difficulty)
);

create table if not exists raid_run_class_requirements (
  id uuid primary key default gen_random_uuid(),
  raid_key text not null,
  difficulty text not null check (difficulty in ('heroic', 'mythic')),
  class text not null,
  spec text,
  min_count integer not null default 0,
  max_count integer,
  foreign key (raid_key, difficulty) references raid_run_templates(raid_key, difficulty) on delete cascade
);

alter table raid_run_templates enable row level security;
alter table raid_run_class_requirements enable row level security;

drop policy if exists "no_public_access_raid_run_templates" on raid_run_templates;
drop policy if exists "no_public_access_raid_run_class_requirements" on raid_run_class_requirements;

create policy "no_public_access_raid_run_templates" on raid_run_templates for all using (false);
create policy "no_public_access_raid_run_class_requirements" on raid_run_class_requirements for all using (false);

create index if not exists idx_raid_run_class_requirements_template
  on raid_run_class_requirements(raid_key, difficulty);
