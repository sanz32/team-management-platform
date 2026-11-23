alter table app_users drop constraint if exists app_users_app_role_check;
alter table app_users add constraint app_users_app_role_check
  check (app_role in ('admin', 'manager', 'member', 'guest', 'friend'));
