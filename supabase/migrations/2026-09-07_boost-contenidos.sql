create table if not exists boost_slot_offers (
  slot_id uuid not null references boost_schedule_slots(id) on delete cascade,
  offer_id uuid not null references boost_offers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (slot_id, offer_id)
);

alter table boost_slot_offers enable row level security;
drop policy if exists "no_public_access_boost_slot_offers" on boost_slot_offers;
create policy "no_public_access_boost_slot_offers" on boost_slot_offers for all using (false);

create index if not exists idx_boost_slot_offers_offer on boost_slot_offers(offer_id);

comment on table boost_slot_offers is
  'Qué paquetes del catálogo se venden dentro de cada corrida agendada. Una corrida SIN ninguna fila acá no se publica en la tienda: no habría nada que elegir.';
