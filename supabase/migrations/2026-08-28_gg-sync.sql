alter table characters add column if not exists mythic_plus_dungeons jsonb;
alter table characters add column if not exists delve_bounty jsonb;
alter table characters add column if not exists gg_observed_at timestamptz;

alter table character_vault add column if not exists item_link text;
alter table character_vault add column if not exists item_level int;
