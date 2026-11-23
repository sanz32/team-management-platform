create table if not exists raid_seasons (
  id uuid primary key default gen_random_uuid(),
  blizzard_journal_instance_id int not null,
  name text not null,
  expansion_id int,
  is_current boolean not null default false,
  synced_at timestamptz default now()
);

create table if not exists raid_bosses (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references raid_seasons(id) on delete cascade not null,
  journal_encounter_id int not null,
  wcl_encounter_id int,
  name text not null,
  order_index int not null,
  image_url text,
  synced_at timestamptz default now(),
  unique (season_id, journal_encounter_id)
);

create table if not exists wishlist_items (
  item_id bigint primary key,
  name text,
  icon_url text,
  slot text,
  item_class text,
  quality text,
  synced_at timestamptz default now()
);

create table if not exists character_sims (
  id uuid primary key default gen_random_uuid(),
  character_id uuid references characters(id) on delete cascade not null,
  provider text not null check (provider in ('raidbots', 'qelive')),
  metric_type text not null check (metric_type in ('dps', 'hps')),
  sim_id text not null,
  sim_url text not null,
  spec text,
  fight_style text,
  imported_at timestamptz default now(),
  is_stale boolean not null default false,
  raw_json jsonb,
  unique (character_id, provider)
);

create table if not exists character_wishlist_upgrades (
  id uuid primary key default gen_random_uuid(),
  sim_id uuid references character_sims(id) on delete cascade not null,
  character_id uuid references characters(id) on delete cascade not null,
  boss_id uuid references raid_bosses(id) on delete cascade not null,
  item_id bigint references wishlist_items(item_id) not null,
  source text not null default 'other' check (source in ('boss', 'vault', 'catalyst', 'crafted', 'other')),
  ilvl int not null,
  upgrade_pct numeric not null,
  upgrade_absolute numeric,
  priority numeric,
  is_tier_piece boolean not null default false,
  created_at timestamptz default now()
);

alter table raid_seasons enable row level security;
alter table raid_bosses enable row level security;
alter table wishlist_items enable row level security;
alter table character_sims enable row level security;
alter table character_wishlist_upgrades enable row level security;

drop policy if exists "no_public_access_raid_seasons" on raid_seasons;
drop policy if exists "no_public_access_raid_bosses" on raid_bosses;
drop policy if exists "no_public_access_wishlist_items" on wishlist_items;
drop policy if exists "no_public_access_character_sims" on character_sims;
drop policy if exists "no_public_access_character_wishlist_upgrades" on character_wishlist_upgrades;

create policy "no_public_access_raid_seasons" on raid_seasons for all using (false);
create policy "no_public_access_raid_bosses" on raid_bosses for all using (false);
create policy "no_public_access_wishlist_items" on wishlist_items for all using (false);
create policy "no_public_access_character_sims" on character_sims for all using (false);
create policy "no_public_access_character_wishlist_upgrades" on character_wishlist_upgrades for all using (false);

create index if not exists idx_raid_bosses_season_id on raid_bosses(season_id, order_index);
create index if not exists idx_character_sims_character_id on character_sims(character_id);
create index if not exists idx_wishlist_upgrades_boss_id on character_wishlist_upgrades(boss_id);
create index if not exists idx_wishlist_upgrades_character_id on character_wishlist_upgrades(character_id);
create index if not exists idx_wishlist_upgrades_sim_id on character_wishlist_upgrades(sim_id);
