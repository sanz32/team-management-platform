alter table boost_bookings
  add column if not exists offer_list_price_gold bigint;

comment on column boost_bookings.offer_list_price_gold is
  'Precio de lista del paquete cuando el lead entró con una oferta del día (10% off). null = pagó precio de lista. offer_price_gold siempre es lo que el comprador vio y acordó pagar.';
