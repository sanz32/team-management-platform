alter table boost_schedule_slots
  add column if not exists local_hold_count integer not null default 0;

alter table boost_schedule_slots
  drop constraint if exists boost_schedule_slots_local_hold_count_check;

alter table boost_schedule_slots
  add constraint boost_schedule_slots_local_hold_count_check
  check (local_hold_count >= 0);

update boost_schedule_slots s
   set local_hold_count = held.n,
       booked_count = greatest(s.booked_count - held.n, 0)
  from (
    select schedule_slot_id, count(*)::integer as n
      from boost_bookings
     where schedule_slot_id is not null
       and status <> 'cancelled'
     group by schedule_slot_id
  ) as held
 where s.id = held.schedule_slot_id
   and s.local_hold_count = 0;

create or replace function boost_claim_slot(p_slot_id uuid)
returns boolean
language plpgsql
as $$
declare
  v_updated integer;
begin
  update boost_schedule_slots
     set local_hold_count = local_hold_count + 1,
         updated_at = now()
   where id = p_slot_id
     and is_active
     and booked_count + local_hold_count < capacity;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

create or replace function boost_release_slot(p_slot_id uuid)
returns void
language sql
as $$
  update boost_schedule_slots
     set local_hold_count = greatest(local_hold_count - 1, 0),
         updated_at = now()
   where id = p_slot_id;
$$;
