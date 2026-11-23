create table if not exists wishlist_splits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references app_users(id),
  created_at timestamptz default now()
);

create table if not exists wishlist_split_assignments (
  id uuid primary key default gen_random_uuid(),
  split_id uuid references wishlist_splits(id) on delete cascade not null,
  character_id uuid references characters(id) on delete cascade not null,
  item_id bigint references wishlist_items(item_id) not null,
  boss_id uuid references raid_bosses(id) not null,
  difficulty text check (difficulty is null or difficulty in ('normal', 'heroic', 'mythic')),
  upgrade_pct numeric,
  upgrade_absolute numeric,
  metric_type text check (metric_type is null or metric_type in ('dps', 'hps')),
  spec_id int references wow_specializations(spec_id),
  added_by uuid references app_users(id),
  created_at timestamptz default now(),
  unique (split_id, character_id, item_id)
);

alter table wishlist_splits enable row level security;
alter table wishlist_split_assignments enable row level security;

drop policy if exists "no_public_access_wishlist_splits" on wishlist_splits;
drop policy if exists "no_public_access_wishlist_split_assignments" on wishlist_split_assignments;

create policy "no_public_access_wishlist_splits" on wishlist_splits for all using (false);
create policy "no_public_access_wishlist_split_assignments" on wishlist_split_assignments for all using (false);

create index if not exists idx_wishlist_split_assignments_split_id on wishlist_split_assignments(split_id);
create index if not exists idx_wishlist_split_assignments_character_id on wishlist_split_assignments(character_id);
