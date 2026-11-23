update raid_bosses set wcl_encounter_id = 3306 where journal_encounter_id = 2795;
update raid_bosses set wcl_encounter_id = 3176 where journal_encounter_id = 2733;
update raid_bosses set wcl_encounter_id = 3177 where journal_encounter_id = 2734;
update raid_bosses set wcl_encounter_id = 3179 where journal_encounter_id = 2736;
update raid_bosses set wcl_encounter_id = 3178 where journal_encounter_id = 2735;
update raid_bosses set wcl_encounter_id = 3180 where journal_encounter_id = 2737;
update raid_bosses set wcl_encounter_id = 3181 where journal_encounter_id = 2738;
update raid_bosses set wcl_encounter_id = 3182 where journal_encounter_id = 2739;

select name, journal_encounter_id
from raid_bosses
where season_id = (select id from raid_seasons where is_current = true limit 1)
  and wcl_encounter_id is null;
