alter table guild_points add column if not exists reverted boolean not null default false;
alter table guild_points add column if not exists reverted_at timestamptz;

create table if not exists point_appeals (
  id uuid primary key default gen_random_uuid(),
  point_id uuid references guild_points(id) on delete cascade not null,
  requester_id uuid references app_users(id) on delete cascade not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  reviewed_by uuid references app_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_point_appeals_unique_pending
  on point_appeals(point_id) where status = 'pending';

create index if not exists idx_point_appeals_requester on point_appeals(requester_id, status);

alter table point_appeals enable row level security;
drop policy if exists "no_public_access_point_appeals" on point_appeals;
create policy "no_public_access_point_appeals" on point_appeals for all using (false);
