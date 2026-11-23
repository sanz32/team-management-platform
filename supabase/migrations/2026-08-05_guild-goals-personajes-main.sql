alter table guild_goals add column if not exists min_ilvl integer;
alter table guild_goals add column if not exists only_mains boolean not null default false;
