alter table app_users add column if not exists binance_id text;

create table if not exists payout_batches (
  id uuid primary key default gen_random_uuid(),
  currency text not null default 'USDT',
  note text,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists payout_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references payout_batches(id) on delete cascade not null,
  user_id uuid references app_users(id) on delete set null,
  discord_username text not null,
  binance_id text not null,
  amount numeric not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  tx_reference text,
  paid_at timestamptz,
  paid_by uuid references app_users(id) on delete set null,
  created_at timestamptz default now()
);

alter table payout_batch_items add column if not exists service_cut_ids jsonb not null default '[]';
alter table payout_batch_items drop column if exists ob_discount_id;
alter table payout_batch_items drop column if exists discounted_amount;
alter table ob_discounts drop column if exists source;

alter table payout_batches enable row level security;
drop policy if exists "no_public_access_payout_batches" on payout_batches;
create policy "no_public_access_payout_batches" on payout_batches for all using (false);

alter table payout_batch_items enable row level security;
drop policy if exists "no_public_access_payout_batch_items" on payout_batch_items;
create policy "no_public_access_payout_batch_items" on payout_batch_items for all using (false);
