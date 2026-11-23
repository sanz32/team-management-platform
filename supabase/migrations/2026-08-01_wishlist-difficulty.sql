alter table character_wishlist_upgrades add column if not exists difficulty text;
alter table character_wishlist_upgrades drop constraint if exists character_wishlist_upgrades_difficulty_check;
alter table character_wishlist_upgrades add constraint character_wishlist_upgrades_difficulty_check
  check (difficulty is null or difficulty in ('normal', 'heroic', 'mythic'));
