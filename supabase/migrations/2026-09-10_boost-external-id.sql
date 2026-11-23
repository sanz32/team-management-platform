alter table boost_schedule_slots
  add column if not exists external_id bigint;

create unique index if not exists idx_boost_slots_external_id
  on boost_schedule_slots(external_id)
  where external_id is not null;
