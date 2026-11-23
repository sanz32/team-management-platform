alter table service_cuts alter column user_id drop not null;
alter table service_cuts add column if not exists freelance_name text;
alter table service_cuts add column if not exists cut_percent numeric(5,2) not null default 100;

alter table service_cuts drop constraint if exists service_cuts_user_or_freelance;
alter table service_cuts add constraint service_cuts_user_or_freelance check (
  (user_id is not null and freelance_name is null)
  or (user_id is null and freelance_name is not null)
);
