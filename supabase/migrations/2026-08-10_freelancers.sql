create table if not exists freelancers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  binance_id text,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz default now()
);

create unique index if not exists idx_freelancers_name_lower on freelancers (lower(name));

alter table service_cuts add column if not exists freelancer_id uuid references freelancers(id) on delete set null;
create index if not exists idx_service_cuts_freelancer_id on service_cuts(freelancer_id);

alter table payout_batch_items add column if not exists freelancer_id uuid references freelancers(id) on delete set null;
create index if not exists idx_payout_batch_items_freelancer_id on payout_batch_items(freelancer_id, status);

alter table payout_batch_items drop constraint if exists payout_batch_items_user_or_freelancer;
alter table payout_batch_items add constraint payout_batch_items_user_or_freelancer check (
  (user_id is not null and freelancer_id is null)
  or (user_id is null and freelancer_id is not null)
);

alter table freelancers enable row level security;
drop policy if exists "no_public_access_freelancers" on freelancers;
create policy "no_public_access_freelancers" on freelancers for all using (false);
