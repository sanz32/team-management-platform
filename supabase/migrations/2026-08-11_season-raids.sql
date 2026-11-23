do $$
declare
  v_season_id uuid;
  v_dream_rift_id uuid;
  v_voidspire_id uuid;
  v_queldanas_id uuid;
  v_sporefall_id uuid;
begin
  select id into v_season_id from raid_seasons where is_current = true limit 1;
  if v_season_id is null then
    raise exception 'No hay ninguna raid_seasons con is_current=true -- correr primero el sync de Wishlist si esto es una base nueva.';
  end if;

  update raid_seasons set game_season_id = 17 where id = v_season_id;

  insert into season_raids (
    season_id, raid_key, blizzard_instance_name, name, abbr, color, color_class,
    difficulties, lockout_source, force_wcl_manual_refresh, header_image_url, order_index
  ) values
    (v_season_id, 'dream_rift', 'The Dreamrift', 'Dream Rift', 'DR', '#4ade80', 'text-green-400',
     '{heroic,mythic}', 'blizzard', false,
     'https://wow.zamimg.com/optimized/guide-header-revamp/uploads/guide/header/9601733dd598954eb63620efaa7978e1a5a14a61.jpg', 1),
    (v_season_id, 'voidspire', 'The Voidspire', 'Voidspire', 'VS', '#f472b6', 'text-pink-400',
     '{heroic,mythic}', 'blizzard', false,
     'https://wow.zamimg.com/optimized/guide-header-revamp/uploads/guide/header/37357f1e59c5b49de2c0dd9af4b11529888f67ce.jpg', 2),
    (v_season_id, 'queldanas', 'March on Quel''Danas', 'March on Quel''Danas', 'MQ', '#c084fc', 'text-purple-400',
     '{heroic,mythic}', 'blizzard', true,
     'https://wow.zamimg.com/optimized/guide-header-revamp/uploads/guide/header/fcfbc7d789bd78e9aa578cb8f3bf7d3c707ee39a.jpg', 3),
    (v_season_id, 'sporefall', 'Sporefall', 'Sporefall', 'SP', '#facc15', 'text-yellow-400',
     '{heroic,mythic}', 'wcl', true,
     'https://wow.zamimg.com/optimized/guide-header-revamp/uploads/guide/header/675a1121b7a2db0b8c36a74176c6b4f8b20bcb95.jpg', 4)
  on conflict (season_id, raid_key) do nothing;

  select id into v_dream_rift_id from season_raids where season_id = v_season_id and raid_key = 'dream_rift';
  select id into v_voidspire_id from season_raids where season_id = v_season_id and raid_key = 'voidspire';
  select id into v_queldanas_id from season_raids where season_id = v_season_id and raid_key = 'queldanas';
  select id into v_sporefall_id from season_raids where season_id = v_season_id and raid_key = 'sporefall';

  update raid_bosses set season_raid_id = v_dream_rift_id
    where season_id = v_season_id and journal_encounter_id = 2795;

  update raid_bosses set season_raid_id = v_voidspire_id
    where season_id = v_season_id and journal_encounter_id in (2733, 2734, 2736, 2735, 2737, 2738);

  update raid_bosses set season_raid_id = v_queldanas_id
    where season_id = v_season_id and journal_encounter_id in (2739, 2740);

  update raid_bosses set season_raid_id = v_sporefall_id
    where season_id = v_season_id and journal_encounter_id = 2711;

  update raid_bosses set wcl_encounter_id = 3306 where season_id = v_season_id and journal_encounter_id = 2795;
  update raid_bosses set wcl_encounter_id = 3176 where season_id = v_season_id and journal_encounter_id = 2733;
  update raid_bosses set wcl_encounter_id = 3177 where season_id = v_season_id and journal_encounter_id = 2734;
  update raid_bosses set wcl_encounter_id = 3179 where season_id = v_season_id and journal_encounter_id = 2736;
  update raid_bosses set wcl_encounter_id = 3178 where season_id = v_season_id and journal_encounter_id = 2735;
  update raid_bosses set wcl_encounter_id = 3180 where season_id = v_season_id and journal_encounter_id = 2737;
  update raid_bosses set wcl_encounter_id = 3181 where season_id = v_season_id and journal_encounter_id = 2738;
  update raid_bosses set wcl_encounter_id = 3182 where season_id = v_season_id and journal_encounter_id = 2739;

  update raid_bosses set attempt_based_difficulties = '{mythic}'
    where season_id = v_season_id and journal_encounter_id = 2740;

  if (select count(*) from raid_bosses where season_id = v_season_id and season_raid_id is null) > 0 then
    raise warning 'Quedaron jefes de la season actual sin season_raid_id -- revisar a mano.';
  end if;
end $$;
