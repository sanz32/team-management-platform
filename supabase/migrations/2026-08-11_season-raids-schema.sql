alter table raid_seasons add column if not exists game_season_id int;

create table if not exists season_raids (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references raid_seasons(id) on delete cascade not null,
  raid_key text not null,
  blizzard_journal_instance_id int,
  blizzard_instance_name text,
  name text not null,
  abbr text not null,
  color text not null,
  color_class text not null,
  difficulties text[] not null default '{}',
  lockout_source text not null default 'blizzard',
  force_wcl_manual_refresh boolean not null default false,
  header_image_url text,
  order_index int not null default 0,
  synced_at timestamptz default now(),
  unique (season_id, raid_key)
);

alter table raid_bosses add column if not exists season_raid_id uuid references season_raids(id) on delete cascade;
alter table raid_bosses add column if not exists attempt_based_difficulties text[] not null default '{}';
