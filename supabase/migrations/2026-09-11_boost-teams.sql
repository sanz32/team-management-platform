alter table app_users add column if not exists discord_global_name text;

alter table boost_raider_links add column if not exists team_name text;

comment on column app_users.discord_global_name is
  'Nombre para mostrar de Discord (global_name), ej. "♛𝓥𝓮𝔁♛". Puede ser null: no todos lo tienen puesto, y ahí se cae a discord_username. NO confundir con discord_username, que es el handle técnico y el que matchea el "Player" del balance.';

comment on column boost_raider_links.team_name is
  'Nombre de team con el que este ADV vende en el Discord de market, ej. "Team Vex". Lo elige la persona. Null = todavía no lo configuró y la tienda cae al nombre del guild.';
