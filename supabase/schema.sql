create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  discord_id text unique not null,
  discord_username text,
  avatar_url text,
  app_role text not null default 'member' check (app_role in ('admin', 'manager', 'member')),
  created_at timestamptz default now(),
  nickname text unique
);

alter table app_users drop constraint if exists app_users_app_role_check;
alter table app_users add constraint app_users_app_role_check
  check (app_role in ('admin', 'manager', 'member', 'guest', 'friend'));

create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade not null,
  name text not null,
  realm_slug text not null,
  region text not null default 'us',
  class text,
  active_spec text,
  role text,
  ilvl int,
  last_updated timestamptz,
  created_at timestamptz default now(),
  unique (name, realm_slug, region)
);

alter table characters add column if not exists equipment_snapshot jsonb;
alter table characters add column if not exists stats_snapshot jsonb;
alter table characters add column if not exists snapshot_updated_at timestamptz;
alter table characters add column if not exists character_render_url text;
alter table characters add column if not exists race text;
alter table characters add column if not exists gender text;
alter table characters add column if not exists tier_piece_count int;
alter table characters add column if not exists tier_set_name text;
alter table characters add column if not exists tier_pieces jsonb;

alter table characters add column if not exists specs jsonb not null default '[]'::jsonb;

alter table characters add column if not exists is_main boolean not null default false;

alter table characters add column if not exists faction text;

alter table characters add column if not exists realm_name text;

alter table characters add column if not exists level int;

create table if not exists boss_kills (
  id uuid primary key default gen_random_uuid(),
  character_id uuid references characters(id) on delete cascade not null,
  boss_key text not null,
  lockout_week date not null,
  created_at timestamptz default now(),
  unique (character_id, boss_key, lockout_week)
);

create table if not exists boss_progress (
  id uuid primary key default gen_random_uuid(),
  character_id uuid references characters(id) on delete cascade not null,
  boss_key text not null,
  completed_count int not null default 0,
  updated_at timestamptz default now(),
  unique (character_id, boss_key)
);

create table if not exists availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade not null,
  date date not null,
  available boolean not null default true,
  note text,
  unique (user_id, date)
);

create table if not exists services_sold (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  total_price numeric(10,2) not null,
  currency text not null default 'USD',
  sold_date date not null default current_date,
  fully_paid boolean not null default false,
  paid_at timestamptz,
  adv_user_id uuid references app_users(id),
  created_by uuid references app_users(id),
  created_at timestamptz default now()
);

alter table services_sold add column if not exists paid_at timestamptz;

alter table services_sold add column if not exists adv_cut_percent numeric(5,2) not null default 20;

create table if not exists service_cuts (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references services_sold(id) on delete cascade not null,
  user_id uuid references app_users(id) on delete cascade,
  freelance_name text,
  cut_percent numeric(5,2) not null default 100,
  cut_amount numeric(10,2) not null,
  paid boolean not null default false,
  paid_date date,
  unique (service_id, user_id),
  constraint service_cuts_user_or_freelance check (
    (user_id is not null and freelance_name is null)
    or (user_id is null and freelance_name is not null)
  )
);

alter table service_cuts alter column user_id drop not null;
alter table service_cuts add column if not exists freelance_name text;
alter table service_cuts add column if not exists cut_percent numeric(5,2) not null default 100;
alter table service_cuts drop constraint if exists service_cuts_user_or_freelance;
alter table service_cuts add constraint service_cuts_user_or_freelance check (
  (user_id is not null and freelance_name is null)
  or (user_id is null and freelance_name is not null)
);

create table if not exists saved_rosters (
  id uuid primary key default gen_random_uuid(),
  scheduled_for timestamptz not null,
  roles jsonb not null,
  target_avg_ilvl numeric,
  content jsonb,
  class_requirements jsonb,
  selected jsonb not null,
  average_ilvl numeric not null,
  created_by uuid references app_users(id),
  created_at timestamptz default now(),
  discord_message_id text
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade not null,
  type text not null default 'roster_selected',
  roster_id uuid references saved_rosters(id) on delete cascade,
  message text not null,
  read boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists balance_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade not null,
  type text not null check (type in ('ib', 'gold')),
  amount numeric(14,2) not null,
  note text,
  paid boolean not null default false,
  paid_at timestamptz,
  created_by uuid references app_users(id),
  created_at timestamptz default now()
);

create table if not exists gold_exchange_rate (
  id uuid primary key default gen_random_uuid(),
  gold_per_usd numeric(14,2) not null,
  updated_by uuid references app_users(id),
  updated_at timestamptz default now()
);

create table if not exists external_balances (
  id uuid primary key default gen_random_uuid(),
  player_name text not null unique,
  balance_gold numeric(14,2) not null default 0,
  balance_usd numeric(14,2) not null default 0,
  matched_user_id uuid references app_users(id),
  imported_at timestamptz default now()
);

alter table external_balances drop column if exists gold_cut;
alter table external_balances drop column if exists gold_collected;
alter table external_balances drop column if exists daily_balance;
alter table external_balances drop column if exists balance_total;
alter table external_balances add column if not exists balance_gold numeric(14,2) not null default 0;
alter table external_balances add column if not exists balance_usd numeric(14,2) not null default 0;
alter table external_balances add column if not exists matched_user_id uuid references app_users(id);

alter table balance_adjustments add column if not exists external_balance_id uuid references external_balances(id) on delete cascade;

alter table balance_adjustments add column if not exists paid boolean not null default false;
alter table balance_adjustments add column if not exists paid_at timestamptz;

create table if not exists weekly_earnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade not null,
  week_start date not null,
  week_end date not null,
  total_generated numeric(10,2) not null default 0,
  total_paid numeric(10,2) not null default 0,
  status text not null default 'pendiente' check (status in ('pendiente', 'pagado')),
  created_by uuid references app_users(id),
  created_at timestamptz default now(),
  unique (user_id, week_start)
);

alter table weekly_earnings add column if not exists ib_paid numeric(10,2) not null default 0;
alter table weekly_earnings add column if not exists gold_paid_usd numeric(10,2) not null default 0;
alter table weekly_earnings add column if not exists gold_paid_amount numeric(14,2) not null default 0;
alter table weekly_earnings add column if not exists ob_paid numeric(10,2) not null default 0;

create table if not exists item_icons (
  item_id bigint not null,
  region text not null,
  icon_url text,
  updated_at timestamptz default now(),
  primary key (item_id, region)
);

create table if not exists item_set_info (
  item_id bigint not null,
  region text not null,
  set_id int,
  set_name text,
  member_item_ids jsonb,
  updated_at timestamptz default now(),
  primary key (item_id, region)
);

create table if not exists wcl_reports (
  id uuid primary key default gen_random_uuid(),
  report_code text not null unique,
  title text,
  zone_name text,
  report_started_at timestamptz,
  imported_by uuid references app_users(id),
  imported_at timestamptz default now()
);

create table if not exists raid_attendance (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references wcl_reports(id) on delete cascade not null,
  character_id uuid references characters(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (report_id, character_id)
);

alter table raid_attendance drop constraint if exists raid_attendance_report_id_character_id_key;
alter table raid_attendance add column if not exists fight_id integer not null;
alter table raid_attendance add column if not exists boss_name text;
alter table raid_attendance add constraint raid_attendance_report_fight_character_key unique (report_id, fight_id, character_id);

create table if not exists wcl_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  connected_by uuid references app_users(id),
  wcl_user_name text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz default now()
);

create table if not exists raid_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  created_by uuid references app_users(id),
  created_at timestamptz default now()
);

alter table raid_plans add column if not exists boss_slug text;

create table if not exists guild_goals (
  id uuid primary key default gen_random_uuid(),
  goal_type text not null unique check (goal_type in ('characters', 'avg_ilvl')),
  target integer not null,
  updated_by uuid references app_users(id),
  updated_at timestamptz default now()
);

alter table guild_goals drop column if exists published;

alter table guild_goals add column if not exists min_ilvl integer;
alter table guild_goals add column if not exists only_mains boolean not null default false;

alter table guild_goals add column if not exists deadline_offset_minutes integer;

create table if not exists guild_goal_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade not null,
  goal_type text not null check (goal_type in ('characters', 'avg_ilvl')),
  week_start date not null,
  deadline_at timestamptz not null,
  target integer not null,
  current_value integer not null,
  met boolean not null,
  created_at timestamptz default now(),
  unique (user_id, goal_type, week_start)
);

create index if not exists guild_goal_history_user_idx
  on guild_goal_history (user_id, goal_type, week_start desc);

alter table guild_goal_history add column if not exists min_ilvl integer;
alter table guild_goal_history add column if not exists only_mains boolean not null default false;
alter table guild_goal_history add column if not exists top_n integer;

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

create table if not exists goal_close_state (
  key text primary key default 'singleton',
  checked_at timestamptz not null default now()
);

create table if not exists character_display_overrides (
  key text primary key default 'guild',
  vault boolean not null default false,
  currencies boolean not null default false,
  rating boolean not null default false,
  keystone boolean not null default false,
  updated_by uuid references app_users(id),
  updated_at timestamptz default now()
);

create table if not exists roster_ilvl_defaults (
  id uuid primary key default gen_random_uuid(),
  difficulty text not null unique check (difficulty in ('heroic', 'mythic')),
  min_ilvl integer not null,
  updated_by uuid references app_users(id),
  updated_at timestamptz default now()
);

create table if not exists lockout_refresh_state (
  lockout_week text primary key,
  refreshed_at timestamptz not null default now(),
  refreshing_since timestamptz
);

alter table lockout_refresh_state add column if not exists refreshing_since timestamptz;

create table if not exists day_off_swap_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references app_users(id) on delete cascade not null,
  recipient_id uuid references app_users(id) on delete cascade not null,
  requester_availability_id uuid references availability(id) on delete set null,
  recipient_availability_id uuid references availability(id) on delete set null,
  requester_date date not null,
  recipient_date date not null,
  message text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'cancelled', 'expired')),
  responded_at timestamptz,
  created_at timestamptz default now(),
  check (requester_id <> recipient_id)
);

create unique index if not exists idx_swap_requests_unique_pending
  on day_off_swap_requests(requester_availability_id, recipient_availability_id)
  where status = 'pending';

create table if not exists blizzard_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade not null unique,
  battletag text,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  updated_at timestamptz default now()
);

alter table blizzard_oauth_tokens alter column refresh_token drop not null;

create table if not exists product_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  feature_path text not null,
  created_at timestamptz default now()
);

alter table product_updates add column if not exists image_url text;

alter table app_users add column if not exists dismissed_update_id uuid references product_updates(id);
alter table app_users add column if not exists visited_update_id uuid references product_updates(id);

alter table characters add column if not exists sort_order integer;

create table if not exists guild_breaks (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  source text not null default 'manual' check (source in ('manual', 'mrt-watcher')),
  created_by uuid references app_users(id),
  created_at timestamptz default now()
);

create table if not exists sync_device_pairings (
  id uuid primary key default gen_random_uuid(),
  device_code text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'expired')),
  user_id uuid references app_users(id) on delete cascade,
  token_to_deliver text,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create table if not exists sync_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade not null unique,
  token_hash text not null,
  created_at timestamptz default now(),
  last_used_at timestamptz
);

create table if not exists character_vault (
  id uuid primary key default gen_random_uuid(),
  character_id uuid references characters(id) on delete cascade not null,
  slot_type text not null,
  slot_index int not null,
  threshold int,
  progress int,
  level int,
  has_available_rewards boolean not null default false,
  updated_at timestamptz default now(),
  unique (character_id, slot_type, slot_index)
);

alter table character_vault add column if not exists item_link text;
alter table character_vault add column if not exists item_level int;

create table if not exists character_currencies (
  id uuid primary key default gen_random_uuid(),
  character_id uuid references characters(id) on delete cascade not null,
  currency_id int not null,
  name text,
  quantity int not null default 0,
  currency_type text,
  updated_at timestamptz default now(),
  unique (character_id, currency_id)
);

alter table characters add column if not exists gold numeric;
alter table characters add column if not exists mythic_plus_rating numeric;
alter table characters add column if not exists mythic_plus_best_season_score numeric;
alter table characters add column if not exists mythic_plus_keystone jsonb;

alter table characters add column if not exists mythic_plus_dungeons jsonb;
alter table characters add column if not exists delve_bounty jsonb;

alter table characters add column if not exists gg_observed_at timestamptz;

alter table characters add column if not exists desktop_synced_at timestamptz;

create table if not exists tracked_currencies (
  currency_id int primary key,
  updated_at timestamptz default now(),
  updated_by uuid references app_users(id)
);

create table if not exists currency_icons (
  currency_id int primary key,
  icon_name text,
  icon_url text,
  name text,
  updated_at timestamptz default now()
);

alter table character_currencies add column if not exists total_earned int;
alter table character_currencies add column if not exists max_quantity int;
alter table character_currencies add column if not exists use_total_earned_for_max_qty boolean;
alter table character_currencies add column if not exists max_weekly_quantity int;
alter table character_currencies add column if not exists quantity_earned_this_week int;

create table if not exists currency_autotrack (
  season_id int primary key,
  applied_at timestamptz default now()
);

alter table currency_autotrack enable row level security;
drop policy if exists "no_public_access_currency_autotrack" on currency_autotrack;
create policy "no_public_access_currency_autotrack" on currency_autotrack for all using (false);

alter table characters add column if not exists blizzard_character_id bigint;

alter table characters drop column if exists wow_account_id;
alter table characters add column if not exists wow_account_number int;

alter table day_off_swap_requests drop constraint if exists day_off_swap_requests_status_check;
alter table day_off_swap_requests add constraint day_off_swap_requests_status_check
  check (status in ('pending', 'awaiting_rl', 'accepted', 'rejected', 'denied', 'cancelled', 'expired'));

alter table day_off_swap_requests add column if not exists reviewed_by uuid references app_users(id) on delete set null;
alter table day_off_swap_requests add column if not exists reviewed_at timestamptz;

drop index if exists idx_swap_requests_unique_pending;
create unique index if not exists idx_swap_requests_unique_open
  on day_off_swap_requests(requester_availability_id, recipient_availability_id)
  where status in ('pending', 'awaiting_rl');

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

create table if not exists guild_session_ends (
  id uuid primary key default gen_random_uuid(),
  session_date text not null unique,
  ended_by uuid references app_users(id) on delete set null,
  created_at timestamptz default now()
);

alter table app_users add column if not exists has_mochila boolean not null default false;

alter table app_users add column if not exists mochila_count integer not null default 0;

alter table saved_rosters add column if not exists mochila_requested_count integer;
alter table saved_rosters add column if not exists mochila_assignees jsonb;

create or replace function increment_mochila_count(p_user_ids uuid[])
returns void
language sql
as $$
  update app_users set mochila_count = mochila_count + 1
  where id = any(p_user_ids);
$$;

create or replace function decrement_mochila_count(p_user_ids uuid[])
returns void
language sql
as $$
  update app_users set mochila_count = greatest(mochila_count - 1, 0)
  where id = any(p_user_ids);
$$;

alter table app_users add column if not exists excluded_from_roster boolean not null default false;

create table if not exists user_main_classes (
  user_id uuid references app_users(id) on delete cascade not null,
  class text not null,
  source text not null default 'auto' check (source in ('auto', 'manual')),
  updated_at timestamptz default now(),
  primary key (user_id, class)
);

alter table characters add column if not exists roster_tier text not null default 'normal';
alter table characters drop constraint if exists characters_roster_tier_check;
alter table characters add constraint characters_roster_tier_check
  check (roster_tier in ('preferido', 'normal', 'ultimo_recurso', 'excluido'));
alter table characters add column if not exists roster_note text;

create table if not exists raid_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  slot_index int not null unique check (slot_index between 1 and 4),
  hour int not null check (hour between 0 and 23),
  minute int not null default 0 check (minute between 0 and 59),
  updated_by uuid references app_users(id),
  updated_at timestamptz default now()
);

create table if not exists raid_seasons (
  id uuid primary key default gen_random_uuid(),
  blizzard_journal_instance_id int not null,
  name text not null,
  expansion_id int,
  is_current boolean not null default false,
  synced_at timestamptz default now()
);

alter table raid_seasons add column if not exists game_season_id int;

create table if not exists raid_bosses (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references raid_seasons(id) on delete cascade not null,
  journal_encounter_id int not null,
  wcl_encounter_id int,
  name text not null,
  order_index int not null,
  image_url text,
  synced_at timestamptz default now(),
  unique (season_id, journal_encounter_id)
);

create table if not exists season_raids (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references raid_seasons(id) on delete cascade not null,
  raid_key text not null,
  blizzard_journal_instance_id int,
  blizzard_instance_name text,
  name text not null,
  abbr text not null,
  color text not null,
  color_class text not null,
  difficulties text[] not null default '{}',
  lockout_source text not null default 'blizzard',
  force_wcl_manual_refresh boolean not null default false,
  header_image_url text,
  order_index int not null default 0,
  synced_at timestamptz default now(),
  unique (season_id, raid_key)
);

alter table raid_bosses add column if not exists season_raid_id uuid references season_raids(id) on delete cascade;

alter table raid_bosses add column if not exists attempt_based_difficulties text[] not null default '{}';

create table if not exists wishlist_items (
  item_id bigint primary key,
  name text,
  icon_url text,
  slot text,
  item_class text,
  quality text,
  synced_at timestamptz default now()
);

alter table wishlist_items add column if not exists item_subclass text;

create table if not exists wow_specializations (
  spec_id int primary key,
  class_name text not null,
  spec_name text not null,
  role text not null check (role in ('tank', 'heal', 'dps')),
  icon_url text,
  updated_at timestamptz default now(),
  unique (class_name, spec_name)
);

create table if not exists character_sims (
  id uuid primary key default gen_random_uuid(),
  character_id uuid references characters(id) on delete cascade not null,
  provider text not null check (provider in ('raidbots', 'qelive')),
  metric_type text not null check (metric_type in ('dps', 'hps')),
  sim_id text not null,
  sim_url text not null,
  spec text,
  fight_style text,
  imported_at timestamptz default now(),
  is_stale boolean not null default false,
  raw_json jsonb,
  unique (character_id, provider)
);

alter table character_sims add column if not exists spec_id int references wow_specializations(spec_id);
alter table character_sims drop constraint if exists character_sims_character_id_provider_key;
alter table character_sims drop constraint if exists character_sims_character_id_provider_spec_id_key;
alter table character_sims add constraint character_sims_character_id_provider_spec_id_key
  unique (character_id, provider, spec_id);

alter table character_sims add column if not exists baseline_output numeric;

create table if not exists character_wishlist_upgrades (
  id uuid primary key default gen_random_uuid(),
  sim_id uuid references character_sims(id) on delete cascade not null,
  character_id uuid references characters(id) on delete cascade not null,
  boss_id uuid references raid_bosses(id) on delete cascade not null,
  item_id bigint references wishlist_items(item_id) not null,
  source text not null default 'other' check (source in ('boss', 'vault', 'catalyst', 'crafted', 'other')),
  ilvl int not null,
  upgrade_pct numeric not null,
  upgrade_absolute numeric,
  priority numeric,
  is_tier_piece boolean not null default false,
  created_at timestamptz default now()
);

alter table character_wishlist_upgrades add column if not exists difficulty text;
alter table character_wishlist_upgrades drop constraint if exists character_wishlist_upgrades_difficulty_check;
alter table character_wishlist_upgrades add constraint character_wishlist_upgrades_difficulty_check
  check (difficulty is null or difficulty in ('normal', 'heroic', 'mythic'));

create table if not exists wishlist_splits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references app_users(id),
  created_at timestamptz default now()
);

create table if not exists wishlist_split_assignments (
  id uuid primary key default gen_random_uuid(),
  split_id uuid references wishlist_splits(id) on delete cascade not null,
  character_id uuid references characters(id) on delete cascade not null,
  item_id bigint references wishlist_items(item_id) not null,
  boss_id uuid references raid_bosses(id) not null,
  difficulty text check (difficulty is null or difficulty in ('normal', 'heroic', 'mythic')),
  upgrade_pct numeric,
  upgrade_absolute numeric,
  metric_type text check (metric_type is null or metric_type in ('dps', 'hps')),
  spec_id int references wow_specializations(spec_id),
  added_by uuid references app_users(id),
  created_at timestamptz default now(),
  unique (split_id, character_id, item_id)
);

create table if not exists mythic_plus_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references app_users(id),
  archived_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists mythic_plus_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references mythic_plus_groups(id) on delete cascade not null,
  user_id uuid references app_users(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (group_id, user_id)
);

create table if not exists mythic_plus_group_runs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references mythic_plus_groups(id) on delete cascade not null,
  source text not null check (source in ('raiderio', 'wcl')),
  source_run_id text not null,
  dungeon_name text,
  keystone_level int,
  keystone_upgrades int not null default 0,
  clear_time_ms int,
  completed_at timestamptz not null,
  matched_count int not null,
  roster jsonb,
  avg_ilvl numeric,
  created_at timestamptz default now(),
  unique (group_id, source, source_run_id)
);

create table if not exists mythic_plus_raiderio_cursors (
  character_id uuid primary key references characters(id) on delete cascade,
  last_run_id bigint,
  last_checked_at timestamptz
);

create table if not exists cooldown_spell_library (
  spell_id int primary key,
  name text not null,
  icon_url text,
  class text not null,
  spec text,
  category text check (category in ('raid_cd', 'external', 'personal_defensive', 'utility', 'offensive')),
  duration_seconds int,
  is_active boolean not null default true,
  is_categorized boolean not null default false,
  source text not null check (source in ('talent_api', 'simc_dump', 'manual', 'log_import')),
  synced_at timestamptz default now()
);

create table if not exists reference_log_imports (
  id uuid primary key default gen_random_uuid(),
  wcl_report_code text not null,
  wcl_fight_id int not null,
  boss_id uuid references raid_bosses(id) not null,
  difficulty text,
  source_guild_name text,
  imported_by uuid references app_users(id),
  imported_at timestamptz default now(),
  pull_duration_ms int,
  phase_transitions_ms jsonb
);

create table if not exists reference_boss_events (
  id uuid primary key default gen_random_uuid(),
  reference_log_id uuid references reference_log_imports(id) on delete cascade not null,
  spell_id int not null,
  spell_name text not null,
  timestamp_ms int not null,
  phase text,
  icon_url text
);

create table if not exists reference_cooldown_casts (
  id uuid primary key default gen_random_uuid(),
  reference_log_id uuid references reference_log_imports(id) on delete cascade not null,
  spell_id int references cooldown_spell_library(spell_id) not null,
  caster_name text not null,
  caster_class text,
  caster_spec text,
  timestamp_ms int not null
);

create table if not exists cooldown_plans (
  id uuid primary key default gen_random_uuid(),
  boss_id uuid references raid_bosses(id) not null,
  name text not null,
  created_by uuid references app_users(id),
  based_on_reference_log_id uuid references reference_log_imports(id),
  updated_at timestamptz default now()
);

create table if not exists cooldown_plan_assignments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references cooldown_plans(id) on delete cascade not null,
  spell_id int references cooldown_spell_library(spell_id) not null,
  assigned_character_id uuid references characters(id),
  planned_timestamp_ms int not null,
  source text not null default 'manual' check (source in ('manual', 'imported_from_reference')),
  reference_cast_id uuid references reference_cooldown_casts(id)
);

create table if not exists raid_run_templates (
  raid_key text not null,
  difficulty text not null check (difficulty in ('heroic', 'mythic')),
  tank_count integer not null default 2,
  heal_count integer not null default 4,
  dps_count integer not null default 11,
  max_same_class integer,
  updated_at timestamptz not null default now(),
  primary key (raid_key, difficulty)
);

create table if not exists raid_run_class_requirements (
  id uuid primary key default gen_random_uuid(),
  raid_key text not null,
  difficulty text not null check (difficulty in ('heroic', 'mythic')),
  class text not null,
  spec text,
  min_count integer not null default 0,
  max_count integer,
  foreign key (raid_key, difficulty) references raid_run_templates(raid_key, difficulty) on delete cascade
);

alter table raid_run_templates add column if not exists min_ilvl integer;

alter table raid_run_templates add column if not exists only_mains boolean not null default false;

create table if not exists raid_run_excluded_members (
  user_id uuid primary key references app_users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references app_users(id) on delete set null
);

create table if not exists raid_capacity_snapshot (
  id integer primary key default 1 check (id = 1),
  entries jsonb not null,
  computed_at timestamptz not null default now(),
  computed_by uuid references app_users(id) on delete set null
);

alter table app_users add column if not exists removed_at timestamptz;
alter table app_users add column if not exists removed_by uuid references app_users(id) on delete set null;

alter table app_users add column if not exists binance_id text;

alter table app_users add column if not exists frame_color_1 text;
alter table app_users add column if not exists frame_color_2 text;
alter table app_users add column if not exists frame_name_style text;
alter table app_users drop constraint if exists app_users_frame_name_style_check;
alter table app_users add constraint app_users_frame_name_style_check
  check (frame_name_style is null or frame_name_style in ('gradient', 'solid', 'none'));

create table if not exists ob_discounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade not null,
  amount numeric(10,2) not null check (amount > 0),
  reason text,
  reverted boolean not null default false,
  reverted_at timestamptz,
  created_by uuid references app_users(id) on delete set null,
  reverted_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists payout_batches (
  id uuid primary key default gen_random_uuid(),
  currency text not null default 'USDT',
  note text,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists payout_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references payout_batches(id) on delete cascade not null,
  user_id uuid references app_users(id) on delete set null,
  discord_username text not null,
  binance_id text not null,
  amount numeric(10,2) not null check (amount >= 0),
  service_cut_ids jsonb not null default '[]',
  status text not null default 'pending' check (status in ('pending', 'paid')),
  tx_reference text,
  paid_at timestamptz,
  paid_by uuid references app_users(id) on delete set null,
  created_at timestamptz default now(),
  discount_applied numeric(10,2) not null default 0
);

create table if not exists freelancers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  binance_id text,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz default now()
);

create unique index if not exists idx_freelancers_name_lower on freelancers (lower(name));

alter table service_cuts add column if not exists freelancer_id uuid references freelancers(id) on delete set null;

alter table payout_batch_items add column if not exists freelancer_id uuid references freelancers(id) on delete set null;

alter table payout_batch_items drop constraint if exists payout_batch_items_user_or_freelancer;
alter table payout_batch_items add constraint payout_batch_items_user_or_freelancer check (
  (user_id is not null and freelancer_id is null)
  or (user_id is null and freelancer_id is not null)
);

create table if not exists guild_points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade not null,
  created_by uuid references app_users(id) on delete set null,
  points integer not null default 1 check (points > 0),
  scope text not null check (scope in ('week', 'run')),
  reason text,
  wcl_report_code text,
  wcl_fight_id integer,
  wcl_boss_name text,
  wcl_kill boolean,
  wcl_start_time timestamptz,
  evidence_path text,
  percent numeric(5,2) not null default 10 check (percent > 0),
  week_start date not null,
  created_at timestamptz not null default now(),
  reverted boolean not null default false,
  reverted_at timestamptz
);

create table if not exists guild_points_evidence_cleanup_state (
  key text primary key default 'singleton',
  checked_at timestamptz not null default now()
);

create table if not exists point_appeals (
  id uuid primary key default gen_random_uuid(),
  point_id uuid references guild_points(id) on delete cascade not null,
  requester_id uuid references app_users(id) on delete cascade not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  reviewed_by uuid references app_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table app_users enable row level security;
alter table characters enable row level security;
alter table boss_kills enable row level security;
alter table boss_progress enable row level security;
alter table availability enable row level security;
alter table services_sold enable row level security;
alter table service_cuts enable row level security;
alter table saved_rosters enable row level security;
alter table notifications enable row level security;
alter table balance_adjustments enable row level security;
alter table gold_exchange_rate enable row level security;
alter table external_balances enable row level security;
alter table weekly_earnings enable row level security;
alter table item_icons enable row level security;
alter table item_set_info enable row level security;
alter table wcl_reports enable row level security;
alter table raid_attendance enable row level security;
alter table wcl_oauth_tokens enable row level security;
alter table raid_plans enable row level security;
alter table guild_goals enable row level security;
alter table guild_goal_weeks enable row level security;
alter table roster_ilvl_defaults enable row level security;
alter table character_display_overrides enable row level security;
alter table lockout_refresh_state enable row level security;
alter table day_off_swap_requests enable row level security;
alter table blizzard_oauth_tokens enable row level security;
alter table product_updates enable row level security;
alter table guild_breaks enable row level security;
alter table sync_device_pairings enable row level security;
alter table sync_tokens enable row level security;
alter table character_vault enable row level security;
alter table character_currencies enable row level security;
alter table tracked_currencies enable row level security;
alter table currency_icons enable row level security;
alter table wishlist_splits enable row level security;
alter table wishlist_split_assignments enable row level security;
alter table guild_session_ends enable row level security;
alter table user_main_classes enable row level security;
alter table raid_schedule_slots enable row level security;
alter table raid_seasons enable row level security;
alter table raid_bosses enable row level security;
alter table wishlist_items enable row level security;
alter table character_sims enable row level security;
alter table character_wishlist_upgrades enable row level security;
alter table wow_specializations enable row level security;
alter table cooldown_spell_library enable row level security;
alter table reference_log_imports enable row level security;
alter table reference_boss_events enable row level security;
alter table reference_cooldown_casts enable row level security;
alter table cooldown_plans enable row level security;
alter table cooldown_plan_assignments enable row level security;
alter table raid_run_templates enable row level security;
alter table raid_run_class_requirements enable row level security;
alter table raid_run_excluded_members enable row level security;
alter table raid_capacity_snapshot enable row level security;
alter table ob_discounts enable row level security;
alter table payout_batches enable row level security;
alter table payout_batch_items enable row level security;
alter table freelancers enable row level security;
alter table mythic_plus_groups enable row level security;
alter table mythic_plus_group_members enable row level security;
alter table mythic_plus_group_runs enable row level security;
alter table mythic_plus_raiderio_cursors enable row level security;
alter table guild_points enable row level security;
alter table guild_points_evidence_cleanup_state enable row level security;
alter table point_appeals enable row level security;

drop policy if exists "no_public_access_app_users" on app_users;
drop policy if exists "no_public_access_characters" on characters;
drop policy if exists "no_public_access_boss_kills" on boss_kills;
drop policy if exists "no_public_access_boss_progress" on boss_progress;
drop policy if exists "no_public_access_availability" on availability;
drop policy if exists "no_public_access_services_sold" on services_sold;
drop policy if exists "no_public_access_service_cuts" on service_cuts;
drop policy if exists "no_public_access_saved_rosters" on saved_rosters;
drop policy if exists "no_public_access_notifications" on notifications;
drop policy if exists "no_public_access_balance_adjustments" on balance_adjustments;
drop policy if exists "no_public_access_gold_exchange_rate" on gold_exchange_rate;
drop policy if exists "no_public_access_external_balances" on external_balances;
drop policy if exists "no_public_access_weekly_earnings" on weekly_earnings;
drop policy if exists "no_public_access_item_icons" on item_icons;
drop policy if exists "no_public_access_item_set_info" on item_set_info;
drop policy if exists "no_public_access_wcl_reports" on wcl_reports;
drop policy if exists "no_public_access_raid_attendance" on raid_attendance;
drop policy if exists "no_public_access_wcl_oauth_tokens" on wcl_oauth_tokens;
drop policy if exists "no_public_access_raid_plans" on raid_plans;
drop policy if exists "no_public_access_guild_goals" on guild_goals;
drop policy if exists "no_public_access_guild_goal_weeks" on guild_goal_weeks;
drop policy if exists "no_public_access_roster_ilvl_defaults" on roster_ilvl_defaults;
drop policy if exists "no_public_access_character_display_overrides" on character_display_overrides;
drop policy if exists "no_public_access_lockout_refresh_state" on lockout_refresh_state;
drop policy if exists "no_public_access_day_off_swap_requests" on day_off_swap_requests;
drop policy if exists "no_public_access_blizzard_oauth_tokens" on blizzard_oauth_tokens;
drop policy if exists "no_public_access_product_updates" on product_updates;
drop policy if exists "no_public_access_guild_breaks" on guild_breaks;
drop policy if exists "no_public_access_sync_device_pairings" on sync_device_pairings;
drop policy if exists "no_public_access_sync_tokens" on sync_tokens;
drop policy if exists "no_public_access_character_vault" on character_vault;
drop policy if exists "no_public_access_character_currencies" on character_currencies;
drop policy if exists "no_public_access_tracked_currencies" on tracked_currencies;
drop policy if exists "no_public_access_currency_icons" on currency_icons;
drop policy if exists "no_public_access_guild_session_ends" on guild_session_ends;
drop policy if exists "no_public_access_user_main_classes" on user_main_classes;
drop policy if exists "no_public_access_raid_schedule_slots" on raid_schedule_slots;
drop policy if exists "no_public_access_raid_seasons" on raid_seasons;
drop policy if exists "no_public_access_raid_bosses" on raid_bosses;
drop policy if exists "no_public_access_wishlist_items" on wishlist_items;
drop policy if exists "no_public_access_character_sims" on character_sims;
drop policy if exists "no_public_access_character_wishlist_upgrades" on character_wishlist_upgrades;
drop policy if exists "no_public_access_wow_specializations" on wow_specializations;
drop policy if exists "no_public_access_cooldown_spell_library" on cooldown_spell_library;
drop policy if exists "no_public_access_reference_log_imports" on reference_log_imports;
drop policy if exists "no_public_access_reference_boss_events" on reference_boss_events;
drop policy if exists "no_public_access_reference_cooldown_casts" on reference_cooldown_casts;
drop policy if exists "no_public_access_cooldown_plans" on cooldown_plans;
drop policy if exists "no_public_access_cooldown_plan_assignments" on cooldown_plan_assignments;
drop policy if exists "no_public_access_wishlist_splits" on wishlist_splits;
drop policy if exists "no_public_access_wishlist_split_assignments" on wishlist_split_assignments;
drop policy if exists "no_public_access_mythic_plus_groups" on mythic_plus_groups;
drop policy if exists "no_public_access_mythic_plus_group_members" on mythic_plus_group_members;
drop policy if exists "no_public_access_mythic_plus_group_runs" on mythic_plus_group_runs;
drop policy if exists "no_public_access_mythic_plus_raiderio_cursors" on mythic_plus_raiderio_cursors;
drop policy if exists "no_public_access_guild_points" on guild_points;
drop policy if exists "no_public_access_guild_points_evidence_cleanup_state" on guild_points_evidence_cleanup_state;
drop policy if exists "no_public_access_point_appeals" on point_appeals;

create policy "no_public_access_app_users" on app_users for all using (false);
create policy "no_public_access_characters" on characters for all using (false);
create policy "no_public_access_boss_kills" on boss_kills for all using (false);
create policy "no_public_access_boss_progress" on boss_progress for all using (false);
create policy "no_public_access_availability" on availability for all using (false);
create policy "no_public_access_services_sold" on services_sold for all using (false);
create policy "no_public_access_service_cuts" on service_cuts for all using (false);
create policy "no_public_access_saved_rosters" on saved_rosters for all using (false);
create policy "no_public_access_notifications" on notifications for all using (false);
create policy "no_public_access_balance_adjustments" on balance_adjustments for all using (false);
create policy "no_public_access_gold_exchange_rate" on gold_exchange_rate for all using (false);
create policy "no_public_access_external_balances" on external_balances for all using (false);
create policy "no_public_access_weekly_earnings" on weekly_earnings for all using (false);
create policy "no_public_access_item_icons" on item_icons for all using (false);
create policy "no_public_access_item_set_info" on item_set_info for all using (false);
create policy "no_public_access_wcl_reports" on wcl_reports for all using (false);
create policy "no_public_access_raid_attendance" on raid_attendance for all using (false);
create policy "no_public_access_wcl_oauth_tokens" on wcl_oauth_tokens for all using (false);
create policy "no_public_access_raid_plans" on raid_plans for all using (false);
create policy "no_public_access_guild_goals" on guild_goals for all using (false);
create policy "no_public_access_guild_goal_weeks" on guild_goal_weeks for all using (false);
create policy "no_public_access_roster_ilvl_defaults" on roster_ilvl_defaults for all using (false);
create policy "no_public_access_character_display_overrides" on character_display_overrides for all using (false);
create policy "no_public_access_lockout_refresh_state" on lockout_refresh_state for all using (false);
create policy "no_public_access_day_off_swap_requests" on day_off_swap_requests for all using (false);
create policy "no_public_access_blizzard_oauth_tokens" on blizzard_oauth_tokens for all using (false);
create policy "no_public_access_product_updates" on product_updates for all using (false);
create policy "no_public_access_guild_breaks" on guild_breaks for all using (false);
create policy "no_public_access_sync_device_pairings" on sync_device_pairings for all using (false);
create policy "no_public_access_sync_tokens" on sync_tokens for all using (false);
create policy "no_public_access_character_vault" on character_vault for all using (false);
create policy "no_public_access_character_currencies" on character_currencies for all using (false);
create policy "no_public_access_tracked_currencies" on tracked_currencies for all using (false);
create policy "no_public_access_currency_icons" on currency_icons for all using (false);
create policy "no_public_access_guild_session_ends" on guild_session_ends for all using (false);
create policy "no_public_access_user_main_classes" on user_main_classes for all using (false);
create policy "no_public_access_raid_schedule_slots" on raid_schedule_slots for all using (false);
create policy "no_public_access_raid_seasons" on raid_seasons for all using (false);
create policy "no_public_access_raid_bosses" on raid_bosses for all using (false);
create policy "no_public_access_wishlist_items" on wishlist_items for all using (false);
create policy "no_public_access_character_sims" on character_sims for all using (false);
create policy "no_public_access_character_wishlist_upgrades" on character_wishlist_upgrades for all using (false);
create policy "no_public_access_wow_specializations" on wow_specializations for all using (false);
create policy "no_public_access_cooldown_spell_library" on cooldown_spell_library for all using (false);
create policy "no_public_access_reference_log_imports" on reference_log_imports for all using (false);
create policy "no_public_access_reference_boss_events" on reference_boss_events for all using (false);
create policy "no_public_access_reference_cooldown_casts" on reference_cooldown_casts for all using (false);
create policy "no_public_access_cooldown_plans" on cooldown_plans for all using (false);
create policy "no_public_access_cooldown_plan_assignments" on cooldown_plan_assignments for all using (false);
create policy "no_public_access_wishlist_splits" on wishlist_splits for all using (false);
create policy "no_public_access_wishlist_split_assignments" on wishlist_split_assignments for all using (false);
create policy "no_public_access_mythic_plus_groups" on mythic_plus_groups for all using (false);
create policy "no_public_access_mythic_plus_group_members" on mythic_plus_group_members for all using (false);
create policy "no_public_access_mythic_plus_group_runs" on mythic_plus_group_runs for all using (false);
create policy "no_public_access_mythic_plus_raiderio_cursors" on mythic_plus_raiderio_cursors for all using (false);
create policy "no_public_access_guild_points" on guild_points for all using (false);
create policy "no_public_access_guild_points_evidence_cleanup_state" on guild_points_evidence_cleanup_state for all using (false);
create policy "no_public_access_point_appeals" on point_appeals for all using (false);
create policy "no_public_access_raid_run_templates" on raid_run_templates for all using (false);
create policy "no_public_access_raid_run_class_requirements" on raid_run_class_requirements for all using (false);
create policy "no_public_access_raid_run_excluded_members" on raid_run_excluded_members for all using (false);
create policy "no_public_access_raid_capacity_snapshot" on raid_capacity_snapshot for all using (false);
create policy "no_public_access_ob_discounts" on ob_discounts for all using (false);
drop policy if exists "no_public_access_payout_batches" on payout_batches;
drop policy if exists "no_public_access_payout_batch_items" on payout_batch_items;
drop policy if exists "no_public_access_freelancers" on freelancers;
create policy "no_public_access_payout_batches" on payout_batches for all using (false);
create policy "no_public_access_payout_batch_items" on payout_batch_items for all using (false);
create policy "no_public_access_freelancers" on freelancers for all using (false);

create index if not exists idx_characters_user_id on characters(user_id);
create index if not exists idx_boss_kills_character_id on boss_kills(character_id);
create index if not exists idx_boss_progress_character_id on boss_progress(character_id);
create index if not exists idx_availability_user_date on availability(user_id, date);
create index if not exists idx_service_cuts_user_id on service_cuts(user_id);
create index if not exists idx_service_cuts_service_id on service_cuts(service_id);
create index if not exists idx_saved_rosters_scheduled_for on saved_rosters(scheduled_for);
create index if not exists idx_notifications_user_id on notifications(user_id, read);
create index if not exists idx_balance_adjustments_user_id on balance_adjustments(user_id);
create index if not exists idx_balance_adjustments_external_balance_id on balance_adjustments(external_balance_id);
create index if not exists idx_weekly_earnings_user_id on weekly_earnings(user_id);
create index if not exists idx_weekly_earnings_week_start on weekly_earnings(week_start);
create index if not exists idx_raid_attendance_report_id on raid_attendance(report_id);
create index if not exists idx_raid_attendance_character_id on raid_attendance(character_id);
create index if not exists idx_wcl_oauth_tokens_updated_at on wcl_oauth_tokens(updated_at desc);
create index if not exists idx_raid_plans_created_at on raid_plans(created_at desc);
create index if not exists idx_swap_requests_requester on day_off_swap_requests(requester_id, status);
create index if not exists idx_swap_requests_recipient on day_off_swap_requests(recipient_id, status);
create index if not exists idx_product_updates_created_at on product_updates(created_at desc);
create index if not exists idx_guild_breaks_created_at on guild_breaks(created_at desc);
create index if not exists idx_character_vault_character_id on character_vault(character_id);
create index if not exists idx_character_currencies_character_id on character_currencies(character_id);
create index if not exists idx_character_currencies_currency_id on character_currencies(currency_id);
create index if not exists idx_sync_device_pairings_device_code on sync_device_pairings(device_code);
create index if not exists idx_characters_blizzard_character_id on characters(blizzard_character_id);
create index if not exists idx_raid_bosses_season_id on raid_bosses(season_id, order_index);
create index if not exists idx_character_sims_character_id on character_sims(character_id);
create index if not exists idx_wishlist_upgrades_boss_id on character_wishlist_upgrades(boss_id);
create index if not exists idx_reference_log_imports_boss_id on reference_log_imports(boss_id);
create index if not exists idx_reference_boss_events_log_id on reference_boss_events(reference_log_id);
create index if not exists idx_reference_cooldown_casts_log_id on reference_cooldown_casts(reference_log_id);
create index if not exists idx_cooldown_plans_boss_id on cooldown_plans(boss_id);
create index if not exists idx_cooldown_plan_assignments_plan_id on cooldown_plan_assignments(plan_id);
create index if not exists idx_cooldown_spell_library_is_categorized on cooldown_spell_library(is_categorized) where is_categorized = false;
create index if not exists idx_wishlist_upgrades_character_id on character_wishlist_upgrades(character_id);
create index if not exists idx_wishlist_upgrades_sim_id on character_wishlist_upgrades(sim_id);
create index if not exists idx_wishlist_split_assignments_split_id on wishlist_split_assignments(split_id);
create index if not exists idx_wishlist_split_assignments_character_id on wishlist_split_assignments(character_id);
create index if not exists idx_ob_discounts_user_id on ob_discounts(user_id);
create index if not exists idx_raid_run_class_requirements_template on raid_run_class_requirements(raid_key, difficulty);
create index if not exists idx_mythic_plus_group_members_group_id on mythic_plus_group_members(group_id);
create index if not exists idx_payout_batch_items_batch_id on payout_batch_items(batch_id);
create index if not exists idx_payout_batch_items_user_id on payout_batch_items(user_id, status);
create index if not exists idx_payout_batch_items_freelancer_id on payout_batch_items(freelancer_id, status);
create index if not exists idx_service_cuts_freelancer_id on service_cuts(freelancer_id);
create index if not exists idx_mythic_plus_group_runs_group_id on mythic_plus_group_runs(group_id, completed_at desc);
create index if not exists idx_guild_points_user_week on guild_points(user_id, week_start desc);
create index if not exists idx_guild_points_week on guild_points(week_start desc);

create unique index if not exists idx_point_appeals_unique_pending
  on point_appeals(point_id) where status = 'pending';
create index if not exists idx_point_appeals_requester on point_appeals(requester_id, status);
