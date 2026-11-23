alter table app_users add column if not exists frame_color_1 text;
alter table app_users add column if not exists frame_color_2 text;
alter table app_users add column if not exists frame_name_style text;

alter table app_users drop constraint if exists app_users_frame_name_style_check;

alter table app_users add constraint app_users_frame_name_style_check
  check (frame_name_style is null or frame_name_style in ('gradient', 'solid', 'none'));
