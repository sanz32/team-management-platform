create table if not exists ob_discounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade not null,
  amount numeric(10,2) not null check (amount > 0),
  reason text,
  reverted boolean not null default false,
  reverted_at timestamptz,
  created_by uuid references app_users(id) on delete set null,
  reverted_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table ob_discounts enable row level security;

drop policy if exists "no_public_access_ob_discounts" on ob_discounts;

create policy "no_public_access_ob_discounts" on ob_discounts for all using (false);

create index if not exists idx_ob_discounts_user_id on ob_discounts(user_id);
