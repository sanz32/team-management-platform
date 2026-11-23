alter table boost_bookings alter column offer_price_gold drop not null;

alter table boost_bookings
  add column if not exists source text not null default 'package'
  check (source in ('package', 'run'));

comment on column boost_bookings.source is
  'package = pidió un paquete y el horario se acuerda por Discord; run = se anotó a una corrida ya agendada.';
