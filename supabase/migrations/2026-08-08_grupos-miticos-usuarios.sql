drop table if exists mythic_plus_group_members;

create table mythic_plus_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references mythic_plus_groups(id) on delete cascade not null,
  user_id uuid references app_users(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (group_id, user_id)
);

alter table mythic_plus_group_members enable row level security;

drop policy if exists "no_public_access_mythic_plus_group_members" on mythic_plus_group_members;
create policy "no_public_access_mythic_plus_group_members" on mythic_plus_group_members for all using (false);

create index if not exists idx_mythic_plus_group_members_group_id on mythic_plus_group_members(group_id);
