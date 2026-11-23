create table if not exists guild_goal_weeks (
  week_start date not null,
  goal_type text not null check (goal_type in ('characters', 'avg_ilvl')),
  target integer not null,
  min_ilvl integer,
  only_mains boolean not null default false,
  top_n integer,
  deadline_offset_minutes integer,
  sealed_at timestamptz not null default now(),
  primary key (week_start, goal_type)
);

alter table guild_goal_history add column if not exists min_ilvl integer;
alter table guild_goal_history add column if not exists only_mains boolean not null default false;
alter table guild_goal_history add column if not exists top_n integer;

insert into guild_goal_weeks (week_start, goal_type, target, min_ilvl, only_mains, top_n)
select
  h.week_start,
  h.goal_type,
  max(h.target) as target,
  case when h.goal_type = 'characters' then 295 else null end as min_ilvl,
  false as only_mains,
  (
    select max(c.target)
    from guild_goal_history c
    where c.week_start = h.week_start and c.goal_type = 'characters'
  ) as top_n
from guild_goal_history h
group by h.week_start, h.goal_type
on conflict (week_start, goal_type) do nothing;

update guild_goal_history h
set min_ilvl = w.min_ilvl,
    only_mains = w.only_mains,
    top_n = w.top_n
from guild_goal_weeks w
where w.week_start = h.week_start
  and w.goal_type = h.goal_type
  and h.min_ilvl is null
  and h.top_n is null;

alter table guild_goal_weeks enable row level security;
drop policy if exists "no_public_access_guild_goal_weeks" on guild_goal_weeks;
create policy "no_public_access_guild_goal_weeks" on guild_goal_weeks for all using (false);

