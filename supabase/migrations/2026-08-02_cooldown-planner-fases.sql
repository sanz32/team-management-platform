alter table reference_log_imports add column if not exists phase_transitions_ms jsonb;

alter table cooldown_spell_library drop constraint if exists cooldown_spell_library_source_check;
alter table cooldown_spell_library add constraint cooldown_spell_library_source_check
  check (source in ('talent_api', 'simc_dump', 'manual', 'log_import'));
