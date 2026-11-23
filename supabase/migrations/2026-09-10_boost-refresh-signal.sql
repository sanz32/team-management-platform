create table if not exists boost_refresh_signal (
  id boolean primary key default true check (id),
  requested_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);

insert into boost_refresh_signal (id) values (true) on conflict (id) do nothing;

alter table boost_refresh_signal enable row level security;

drop policy if exists "public_read_boost_refresh_signal" on boost_refresh_signal;
create policy "public_read_boost_refresh_signal"
  on boost_refresh_signal for select using (true);

grant select on table boost_refresh_signal to anon, authenticated;
