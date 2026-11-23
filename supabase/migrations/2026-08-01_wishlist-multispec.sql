alter table wishlist_items add column if not exists item_subclass text;

create table if not exists wow_specializations (
  spec_id int primary key,
  class_name text not null,
  spec_name text not null,
  role text not null check (role in ('tank', 'heal', 'dps')),
  icon_url text,
  updated_at timestamptz default now(),
  unique (class_name, spec_name)
);

alter table wow_specializations enable row level security;
drop policy if exists "no_public_access_wow_specializations" on wow_specializations;
create policy "no_public_access_wow_specializations" on wow_specializations for all using (false);

alter table character_sims add column if not exists spec_id int references wow_specializations(spec_id);
alter table character_sims drop constraint if exists character_sims_character_id_provider_key;
alter table character_sims drop constraint if exists character_sims_character_id_provider_spec_id_key;
alter table character_sims add constraint character_sims_character_id_provider_spec_id_key
  unique (character_id, provider, spec_id);
