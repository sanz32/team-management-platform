create table if not exists item_set_info (
  item_id bigint not null,
  region text not null,
  set_id int,
  set_name text,
  member_item_ids jsonb,
  updated_at timestamptz default now(),
  primary key (item_id, region)
);

alter table item_set_info enable row level security;

drop policy if exists "no_public_access_item_set_info" on item_set_info;

create policy "no_public_access_item_set_info" on item_set_info for all using (false);

alter table characters add column if not exists tier_piece_count int;
alter table characters add column if not exists tier_set_name text;
alter table characters add column if not exists tier_pieces jsonb;
