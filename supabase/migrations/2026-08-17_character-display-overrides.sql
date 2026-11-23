create table if not exists character_display_overrides (
  key text primary key default 'guild',
  vault boolean not null default false,
  currencies boolean not null default false,
  rating boolean not null default false,
  keystone boolean not null default false,
  updated_by uuid references app_users(id),
  updated_at timestamptz default now()
);

alter table character_display_overrides enable row level security;

drop policy if exists "no_public_access_character_display_overrides" on character_display_overrides;

create policy "no_public_access_character_display_overrides" on character_display_overrides for all using (false);
