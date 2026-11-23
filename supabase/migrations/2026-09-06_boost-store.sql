create table if not exists boost_offers (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('normal', 'heroic', 'mythic')),
  group_label text not null default '',
  title_en text not null,
  title_es text not null,
  description_en text,
  description_es text,
  price_gold bigint not null check (price_gold >= 0),
  badge text,
  image_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists boost_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  scheduled_at timestamptz not null,
  difficulty text not null check (difficulty in ('normal', 'heroic', 'mythic')),
  label text,
  capacity integer not null default 1 check (capacity > 0),
  booked_count integer not null default 0 check (booked_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists boost_raider_links (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null unique references app_users(id) on delete cascade,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists boost_bookings (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid references boost_offers(id) on delete set null,
  schedule_slot_id uuid references boost_schedule_slots(id) on delete set null,
  raider_owner_id uuid references app_users(id) on delete set null,

  offer_title text not null,
  offer_price_gold bigint not null,
  offer_category text not null,
  slot_scheduled_at timestamptz,

  character_name text not null,
  character_realm text not null,
  character_realm_slug text not null,
  character_region text not null,
  character_class text,
  character_spec text,
  character_ilvl integer,

  buyer_discord_id text not null,
  buyer_discord_username text,
  buyer_discord_avatar_url text,
  buyer_note text,

  status text not null default 'pending' check (status in ('pending', 'confirmed', 'completed', 'cancelled')),
  status_token text not null unique,
  ip_hash text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table boost_offers enable row level security;
alter table boost_schedule_slots enable row level security;
alter table boost_raider_links enable row level security;
alter table boost_bookings enable row level security;

drop policy if exists "no_public_access_boost_offers" on boost_offers;
drop policy if exists "no_public_access_boost_schedule_slots" on boost_schedule_slots;
drop policy if exists "no_public_access_boost_raider_links" on boost_raider_links;
drop policy if exists "no_public_access_boost_bookings" on boost_bookings;

create policy "no_public_access_boost_offers" on boost_offers for all using (false);
create policy "no_public_access_boost_schedule_slots" on boost_schedule_slots for all using (false);
create policy "no_public_access_boost_raider_links" on boost_raider_links for all using (false);
create policy "no_public_access_boost_bookings" on boost_bookings for all using (false);

create index if not exists idx_boost_offers_active on boost_offers(is_active, category, sort_order);
create index if not exists idx_boost_slots_upcoming on boost_schedule_slots(is_active, difficulty, scheduled_at);
create index if not exists idx_boost_bookings_owner on boost_bookings(raider_owner_id, created_at desc);
create index if not exists idx_boost_bookings_created on boost_bookings(created_at desc);
create index if not exists idx_boost_bookings_buyer on boost_bookings(buyer_discord_id, created_at desc);

create or replace function boost_claim_slot(p_slot_id uuid)
returns boolean
language plpgsql
as $$
declare
  v_updated integer;
begin
  update boost_schedule_slots
     set booked_count = booked_count + 1,
         updated_at = now()
   where id = p_slot_id
     and is_active
     and booked_count < capacity;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

create or replace function boost_release_slot(p_slot_id uuid)
returns void
language sql
as $$
  update boost_schedule_slots
     set booked_count = greatest(booked_count - 1, 0),
         updated_at = now()
   where id = p_slot_id;
$$;

delete from boost_offers
 where group_label in ('Venomous Abyss + Tidebound Grotto', 'VIP, ATP & FP');

insert into boost_offers (category, group_label, title_en, title_es, description_en, description_es, price_gold, badge, sort_order) values
('heroic', 'Venomous Abyss + Tidebound Grotto', 'Tidebound Grotto SAVED', 'Tidebound Grotto SAVED',
 '1/1 - Free Roll - No Item Reserve', '1/1 - Roll libre - Sin ítems reservados', 100000, 'HOT', 10),
('heroic', 'Venomous Abyss + Tidebound Grotto', 'Tidebound Grotto UNSAVED', 'Tidebound Grotto UNSAVED',
 '1/1 - Free Roll - No Item Reserve', '1/1 - Roll libre - Sin ítems reservados', 200000, 'HOT', 20),
('heroic', 'Venomous Abyss + Tidebound Grotto', 'Venomous Abyss 6/8 SAVED', 'Venomous Abyss 6/8 SAVED',
 'for +TG on this bundle add 150k - Group loot - No Item Reserve',
 'para sumar TG a este paquete agrega 150k - Botín en grupo - Sin ítems reservados', 400000, 'HOT', 30),
('heroic', 'Venomous Abyss + Tidebound Grotto', 'Venomous Abyss 6/8 UNSAVED', 'Venomous Abyss 6/8 UNSAVED',
 '4-5 Items per Boss / for +TG on this bundle add 200k - Group loot - No Item Reserve',
 '4-5 ítems por jefe / para sumar TG a este paquete agrega 200k - Botín en grupo - Sin ítems reservados', 800000, 'HOT', 40),
('heroic', 'Venomous Abyss + Tidebound Grotto', 'Venomous Abyss 6/8 UNSAVED + Last TWO SAVED', 'Venomous Abyss 6/8 UNSAVED + los DOS últimos SAVED',
 'First 6/8 Bosses Unsaved 4-5 items, Last Two Saved',
 'Los primeros 6/8 jefes unsaved con 4-5 ítems, los dos últimos saved', 1600000, 'HOT', 50),
('heroic', 'Venomous Abyss + Tidebound Grotto', 'Venomous Abyss 8/8 SAVED', 'Venomous Abyss 8/8 SAVED',
 'for +TG on this bundle add 100k - Group loot - No Item Reserve',
 'para sumar TG a este paquete agrega 100k - Botín en grupo - Sin ítems reservados', 750000, 'HOT', 60),
('heroic', 'Venomous Abyss + Tidebound Grotto', 'Venomous Abyss 8/8 UNSAVED', 'Venomous Abyss 8/8 UNSAVED',
 'for +TG on this bundle add 100k - 4-5 Items per Boss / Group loot - No Item Reserve',
 'para sumar TG a este paquete agrega 100k - 4-5 ítems por jefe / Botín en grupo - Sin ítems reservados', 1500000, 'HOT', 70),
('heroic', 'Venomous Abyss + Tidebound Grotto', 'Venomous Abyss Last Boss', 'Venomous Abyss último jefe',
 'Last Boss Only (Ula''tek)', 'Solo el último jefe (Ula''tek)', 350000, 'HOT', 80),
('heroic', 'Venomous Abyss + Tidebound Grotto', 'Venomous Abyss 2 Last Bosses', 'Venomous Abyss 2 últimos jefes',
 '2 Last Bosses only', 'Solo los 2 últimos jefes', 550000, 'HOT', 90),
('heroic', 'Venomous Abyss + Tidebound Grotto', 'Venomous Abyss 3 Last Bosses', 'Venomous Abyss 3 últimos jefes',
 '3 Last Bosses only', 'Solo los 3 últimos jefes', 700000, 'HOT', 100),
('heroic', 'Venomous Abyss + Tidebound Grotto', 'Venomous Abyss 4 Last Bosses', 'Venomous Abyss 4 últimos jefes',
 '4 Last Bosses only', 'Solo los 4 últimos jefes', 750000, 'HOT', 110);

insert into boost_offers (category, group_label, title_en, title_es, description_en, description_es, price_gold, badge, sort_order) values
('normal', 'Venomous Abyss + Tidebound Grotto', 'Tidebound Grotto SAVED', 'Tidebound Grotto SAVED',
 '1/1 - Free Roll - No Item Reserve', '1/1 - Roll libre - Sin ítems reservados', 50000, 'HOT', 10),
('normal', 'Venomous Abyss + Tidebound Grotto', 'Tidebound Grotto UNSAVED', 'Tidebound Grotto UNSAVED',
 '1/1 - Free Roll - No Item Reserve', '1/1 - Roll libre - Sin ítems reservados', 100000, 'HOT', 20),
('normal', 'Venomous Abyss + Tidebound Grotto', 'Venomous Abyss SAVED', 'Venomous Abyss SAVED',
 '8/8 - Free Roll - No Item Reserve', '8/8 - Roll libre - Sin ítems reservados', 150000, 'HOT', 30),
('normal', 'Venomous Abyss + Tidebound Grotto', 'Venomous Abyss UNSAVED', 'Venomous Abyss UNSAVED',
 '8/8 - Free Roll - No Item Reserve', '8/8 - Roll libre - Sin ítems reservados', 300000, 'HOT', 40),
('normal', 'Venomous Abyss + Tidebound Grotto', 'Venomous Abyss + Tidebound Grotto 9/9 SAVED', 'Venomous Abyss + Tidebound Grotto 9/9 SAVED',
 'TG+VA 9/9 Saved', 'TG+VA 9/9 saved', 250000, 'HOT', 50),
('normal', 'Venomous Abyss + Tidebound Grotto', 'Venomous Abyss + Tidebound Grotto 9/9 UNSAVED', 'Venomous Abyss + Tidebound Grotto 9/9 UNSAVED',
 'TG+VA 9/9 Unsaved', 'TG+VA 9/9 unsaved', 500000, 'HOT', 60),
('normal', 'Venomous Abyss + Tidebound Grotto', 'Venomous Abyss Last Boss', 'Venomous Abyss último jefe',
 'Last Boss Only (Ula''tek)', 'Solo el último jefe (Ula''tek)', 100000, 'HOT', 70);

insert into boost_offers (category, group_label, title_en, title_es, description_en, description_es, price_gold, badge, sort_order, is_active) values
('mythic', 'VIP, ATP & FP', 'Venomous Abyss 2/8 FP', 'Venomous Abyss 2/8 FP',
 'All items you can equip are yours - Nek''zali the Soulcoiler - The Lost Explorers',
 'Todos los ítems que puedas equipar son tuyos - Nek''zali the Soulcoiler - The Lost Explorers', 8650000, 'HOT', 10, true),
('mythic', 'VIP, ATP & FP', 'Venomous Abyss 3/8 FP', 'Venomous Abyss 3/8 FP',
 'All items you can equip are yours', 'Todos los ítems que puedas equipar son tuyos', 16000000, 'HOT', 20, false),
('mythic', 'VIP, ATP & FP', 'Venomous Abyss 4/8 FP', 'Venomous Abyss 4/8 FP',
 'All items you can equip are yours', 'Todos los ítems que puedas equipar son tuyos', 24950000, 'HOT', 30, false),
('mythic', 'VIP, ATP & FP', 'Tidebound Grotto FP15', 'Tidebound Grotto FP15',
 'All items you can equip are yours / 3-4 items drop',
 'Todos los ítems que puedas equipar son tuyos / dropean 3-4 ítems', 4000000, 'HOT', 40, false),
('mythic', 'VIP, ATP & FP', 'Tidebound Grotto FP20', 'Tidebound Grotto FP20',
 'All items you can equip are yours / 4-5 items drop',
 'Todos los ítems que puedas equipar son tuyos / dropean 4-5 ítems', 5200000, 'HOT', 50, false),
('mythic', 'VIP, ATP & FP', 'Tidebound Grotto FP25', 'Tidebound Grotto FP25',
 'All items you can equip are yours / 5-6 items drop',
 'Todos los ítems que puedas equipar son tuyos / dropean 5-6 ítems', 6000000, 'HOT', 60, false);

insert into boost_offers (category, group_label, title_en, title_es, description_en, description_es, price_gold, badge, sort_order) values
('heroic', 'VIP, ATP & FP', 'Venomous Abyss 8/8 ATP 10', 'Venomous Abyss 8/8 ATP 10',
 'ATP 2-3 Drops Per Boss', 'ATP: 2-3 drops por jefe', 3000000, 'HOT', 200),
('heroic', 'VIP, ATP & FP', 'Venomous Abyss 8/8 ATP 15', 'Venomous Abyss 8/8 ATP 15',
 'ATP 3-4 Drops Per Boss', 'ATP: 3-4 drops por jefe', 5500000, 'HOT', 210),
('heroic', 'VIP, ATP & FP', 'Venomous Abyss 8/8 ATP 20', 'Venomous Abyss 8/8 ATP 20',
 'ATP 4-5 Drops Per Boss', 'ATP: 4-5 drops por jefe', 7950000, 'HOT', 220),
('heroic', 'VIP, ATP & FP', 'Venomous Abyss 8/8 ATP 26', 'Venomous Abyss 8/8 ATP 26',
 'ATP 5-6 Drops Per Boss', 'ATP: 5-6 drops por jefe', 10950000, 'HOT', 230),
('heroic', 'VIP, ATP & FP', 'Venomous Abyss 6/8 ATP 20', 'Venomous Abyss 6/8 ATP 20',
 'ATP 4-5 Drops Per Boss', 'ATP: 4-5 drops por jefe', 4950000, 'HOT', 240),
('heroic', 'VIP, ATP & FP', 'Venomous Abyss 6/8 ATP 26', 'Venomous Abyss 6/8 ATP 26',
 'ATP 5-6 Drops Per Boss', 'ATP: 5-6 drops por jefe', 7950000, 'HOT', 250),
('heroic', 'VIP, ATP & FP', 'Venomous Abyss + Tidebound 8/9 FP 20 (VIP)', 'Venomous Abyss + Tidebound 8/9 FP 20 (VIP)',
 'All items you can equip are yours / 4-5 items drop (without ulatek)',
 'Todos los ítems que puedas equipar son tuyos / dropean 4-5 ítems (sin Ula''tek)', 12950000, 'HOT', 260),
('heroic', 'VIP, ATP & FP', 'Venomous + Tidebound 8/9 FP 26 (VIP)', 'Venomous + Tidebound 8/9 FP 26 (VIP)',
 'All items you can equip are yours / 5-6 items drop (without ulatek)',
 'Todos los ítems que puedas equipar son tuyos / dropean 5-6 ítems (sin Ula''tek)', 15950000, 'HOT', 270),
('heroic', 'VIP, ATP & FP', 'Venomous + Tidebound 9/9 FP 10 (VIP)', 'Venomous + Tidebound 9/9 FP 10 (VIP)',
 'All items you can equip are yours / 2-3 items drop',
 'Todos los ítems que puedas equipar son tuyos / dropean 2-3 ítems', 12950000, 'HOT', 280),
('heroic', 'VIP, ATP & FP', 'Venomous + Tidebound 9/9 FP 15 (VIP)', 'Venomous + Tidebound 9/9 FP 15 (VIP)',
 'All items you can equip are yours / 3-4 items drop',
 'Todos los ítems que puedas equipar son tuyos / dropean 3-4 ítems', 13950000, 'HOT', 290),
('heroic', 'VIP, ATP & FP', 'Venomous + Tidebound FP 9/9 20 (VIP)', 'Venomous + Tidebound FP 9/9 20 (VIP)',
 'All items you can equip are yours / 4-5 items drop',
 'Todos los ítems que puedas equipar son tuyos / dropean 4-5 ítems', 15950000, 'HOT', 300),
('heroic', 'VIP, ATP & FP', 'Venomous + Tidebound FP 9/9 26 (VIP)', 'Venomous + Tidebound FP 9/9 26 (VIP)',
 'All items you can equip are yours / 5-6 items drop',
 'Todos los ítems que puedas equipar son tuyos / dropean 5-6 ítems', 19950000, 'HOT', 310);

insert into boost_offers (category, group_label, title_en, title_es, description_en, description_es, price_gold, badge, sort_order) values
('normal', 'VIP, ATP & FP', 'Venomous Abyss 8/8 ATP 10', 'Venomous Abyss 8/8 ATP 10',
 'ATP: 2-3 Drops Per Boss', 'ATP: 2-3 drops por jefe', 1450000, 'HOT', 200),
('normal', 'VIP, ATP & FP', 'Venomous Abyss 8/8 ATP 15', 'Venomous Abyss 8/8 ATP 15',
 'ATP: 3-4 Drops Per Boss', 'ATP: 3-4 drops por jefe', 1950000, 'HOT', 210),
('normal', 'VIP, ATP & FP', 'Venomous Abyss 8/8 ATP 20', 'Venomous Abyss 8/8 ATP 20',
 'ATP: 4-5 Drops Per Boss', 'ATP: 4-5 drops por jefe', 2450000, 'HOT', 220),
('normal', 'VIP, ATP & FP', 'Venomous Abyss 8/8 FP 10', 'Venomous Abyss 8/8 FP 10',
 'All items you can equip are yours / 2-3 items drop',
 'Todos los ítems que puedas equipar son tuyos / dropean 2-3 ítems', 2850000, 'HOT', 230),
('normal', 'VIP, ATP & FP', 'Venomous Abyss 8/8 FP 15', 'Venomous Abyss 8/8 FP 15',
 'All items you can equip are yours / 3-4 items drop',
 'Todos los ítems que puedas equipar son tuyos / dropean 3-4 ítems', 4100000, 'HOT', 240),
('normal', 'VIP, ATP & FP', 'Venomous Abyss 8/8 FP 20', 'Venomous Abyss 8/8 FP 20',
 'All items you can equip are yours / 4-5 items drop',
 'Todos los ítems que puedas equipar son tuyos / dropean 4-5 ítems', 5300000, 'HOT', 250),
('normal', 'VIP, ATP & FP', 'Venomous Abyss 8/8 FP 26', 'Venomous Abyss 8/8 FP 26',
 'All items you can equip are yours / 5-6 items drop',
 'Todos los ítems que puedas equipar son tuyos / dropean 5-6 ítems', 6550000, 'HOT', 260),
('normal', 'VIP, ATP & FP', 'Venomous + Tidebound 9/9 FP 10', 'Venomous + Tidebound 9/9 FP 10',
 'All items you can equip are yours / 2-3 items drop',
 'Todos los ítems que puedas equipar son tuyos / dropean 2-3 ítems', 2950000, 'HOT', 270),
('normal', 'VIP, ATP & FP', 'Venomous + Tidebound 9/9 FP 15', 'Venomous + Tidebound 9/9 FP 15',
 'All items you can equip are yours / 3-4 items drop',
 'Todos los ítems que puedas equipar son tuyos / dropean 3-4 ítems', 4200000, 'HOT', 280),
('normal', 'VIP, ATP & FP', 'Venomous + Tidebound 9/9 FP 20', 'Venomous + Tidebound 9/9 FP 20',
 'All items you can equip are yours / 4-5 items drop',
 'Todos los ítems que puedas equipar son tuyos / dropean 4-5 ítems', 5450000, 'HOT', 290),
('normal', 'VIP, ATP & FP', 'Venomous + Tidebound 9/9 FP 26', 'Venomous + Tidebound 9/9 FP 26',
 'All items you can equip are yours / 5-6 items drop',
 'Todos los ítems que puedas equipar son tuyos / dropean 5-6 ítems', 6700000, 'HOT', 300);

delete from boost_schedule_slots where label like '[ejemplo]%';

insert into boost_schedule_slots (scheduled_at, difficulty, label, capacity, booked_count) values
(date_trunc('hour', now()) + interval '1 day 20 hours', 'heroic', '[ejemplo] SAVED 2x 6/8 + 6x 8/8 Heroic Venomous Abyss', 8, 3),
(date_trunc('hour', now()) + interval '2 days 21 hours', 'heroic', '[ejemplo] UNSAVED 8/8 Heroic Venomous Abyss + Tidebound Grotto', 6, 1),
(date_trunc('hour', now()) + interval '3 days 20 hours', 'normal', '[ejemplo] UNSAVED 9/9 Normal TG + VA', 10, 0),
(date_trunc('hour', now()) + interval '4 days 22 hours', 'normal', '[ejemplo] SAVED 8/8 Normal Venomous Abyss', 10, 8),
(date_trunc('hour', now()) + interval '5 days 20 hours', 'mythic', '[ejemplo] 2/8 Mythic Venomous Abyss · FP', 2, 1),
(date_trunc('hour', now()) + interval '6 days 21 hours', 'heroic', '[ejemplo] ATP 20 · 8/8 Heroic Venomous Abyss', 5, 5),
(date_trunc('hour', now()) + interval '8 days 20 hours', 'heroic', '[ejemplo] Last 4 Bosses · Heroic Venomous Abyss', 4, 0),
(date_trunc('hour', now()) + interval '9 days 21 hours', 'mythic', '[ejemplo] 2/8 Mythic Venomous Abyss · FP', 2, 0);

