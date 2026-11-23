alter table app_users add column if not exists removed_at timestamptz;
alter table app_users add column if not exists removed_by uuid references app_users(id) on delete set null;
