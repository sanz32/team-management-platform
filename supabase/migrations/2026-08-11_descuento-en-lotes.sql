alter table payout_batch_items add column if not exists discount_applied numeric(10,2) not null default 0;

alter table payout_batch_items drop constraint if exists payout_batch_items_amount_check;
alter table payout_batch_items add constraint payout_batch_items_amount_check check (amount >= 0);
