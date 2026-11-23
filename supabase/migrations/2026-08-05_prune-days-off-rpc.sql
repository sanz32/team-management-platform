create or replace function prune_expired_days_off(p_today date)
returns void
language sql
as $$
  delete from availability where available = false and date < p_today;

  update day_off_swap_requests
  set status = 'expired', responded_at = now()
  where status in ('pending', 'awaiting_rl')
    and (requester_date < p_today or recipient_date < p_today);

  delete from day_off_swap_requests
  where requester_date < p_today and recipient_date < p_today;

  delete from day_off_swap_requests
  where requester_availability_id is null and recipient_availability_id is null;
$$;
