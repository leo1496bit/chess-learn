-- Lignes d'ouverture à maîtriser : index des positions, lignes, branches, explications, cache explorateur.

alter table public.games add column positions_indexed boolean not null default false;

-- Positions jouées dans chaque partie (ply = demi-coups joués avant la position) -----------
create table public.game_positions (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ply integer not null,
  epd text not null,
  side_to_move text not null check (side_to_move in ('w', 'b')),
  path_uci text not null,
  move_uci text,
  move_san text,
  primary key (game_id, ply)
);
create index game_positions_user_epd_idx on public.game_positions (user_id, epd);

alter table public.game_positions enable row level security;
create policy owner_all on public.game_positions for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_owner()))
  with check (user_id = (select auth.uid()) and (select public.is_owner()));

-- Lignes ----------------------------------------------------------------------------------
create table public.opening_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  eco text,
  root_epd text not null,
  root_fen text not null,
  prefix_uci text[] not null default '{}',
  prefix_san text[] not null default '{}',
  player_color text not null check (player_color in ('w', 'b')),
  kind text check (kind in ('punish', 'master')),
  status text not null default 'building' check (status in ('building', 'ready')),
  depth integer,
  multipv integer,
  games integer not null default 0,
  wins integer not null default 0,
  draws integer not null default 0,
  losses integer not null default 0,
  explorer_unavailable boolean not null default false,
  created_at timestamptz not null default now(),
  built_at timestamptz,
  unique (user_id, root_epd)
);

alter table public.opening_lines enable row level security;
create policy owner_all on public.opening_lines for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_owner()))
  with check (user_id = (select auth.uid()) and (select public.is_owner()));

-- Branches (chemins depuis la racine de la ligne) -----------------------------------------
create table public.opening_branches (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.opening_lines (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path_uci text[] not null,
  path_san text[] not null,
  end_fen text not null,
  own_games integer not null default 0,
  explorer_games integer not null default 0,
  archived boolean not null default false,
  studied_at timestamptz,
  due_at timestamptz not null default now(),
  interval_days numeric(8, 2) not null default 0,
  attempts integer not null default 0,
  successes integer not null default 0,
  last_result text check (last_result in ('correct', 'incorrect')),
  unique (line_id, path_uci)
);
create index opening_branches_user_idx on public.opening_branches (user_id);

alter table public.opening_branches enable row level security;
create policy owner_all on public.opening_branches for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_owner()))
  with check (user_id = (select auth.uid()) and (select public.is_owner()));

-- Explications IA des branches (cache) ----------------------------------------------------
create table public.opening_branch_explanations (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  branch_id uuid not null references public.opening_branches (id) on delete cascade,
  prompt_version text not null,
  model text not null,
  content jsonb not null,
  verified boolean not null default true,
  created_at timestamptz not null default now(),
  unique (branch_id, prompt_version, model)
);

alter table public.opening_branch_explanations enable row level security;
create policy owner_all on public.opening_branch_explanations for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_owner()))
  with check (user_id = (select auth.uid()) and (select public.is_owner()));

-- Cache de l'explorateur Lichess ----------------------------------------------------------
create table public.explorer_cache (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  epd text not null,
  params text not null,
  data jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (user_id, epd, params)
);

alter table public.explorer_cache enable row level security;
create policy owner_all on public.explorer_cache for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_owner()))
  with check (user_id = (select auth.uid()) and (select public.is_owner()));

-- RPC : réponses adverses observées depuis une position -----------------------------------
-- security invoker : la RLS s'applique, l'utilisateur ne voit que ses parties.
create function public.opening_reply_stats(p_epd text)
returns table (
  move_uci text,
  move_san text,
  games bigint,
  wins bigint,
  draws bigint,
  losses bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select gp.move_uci,
         min(gp.move_san),
         count(*)::bigint,
         count(*) filter (where g.result = 'win')::bigint,
         count(*) filter (where g.result = 'draw')::bigint,
         count(*) filter (where g.result = 'loss')::bigint
  from public.game_positions gp
  join public.games g on g.id = gp.game_id
  where gp.epd = p_epd
    and gp.move_uci is not null
    and g.player_color <> gp.side_to_move
  group by gp.move_uci
  order by count(*) desc
$$;

revoke execute on function public.opening_reply_stats(text) from public, anon;
grant execute on function public.opening_reply_stats(text) to authenticated;

-- RPC : positions les plus fréquentes où c'est au joueur de jouer -------------------------
-- Tri par fréquence décroissante : PostgREST plafonne à 1000 lignes.
create function public.opening_position_stats(p_min_games integer, p_max_ply integer)
returns table (
  epd text,
  player_color text,
  games bigint,
  wins bigint,
  draws bigint,
  losses bigint,
  top_path text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select gp.epd,
         g.player_color,
         count(*)::bigint,
         count(*) filter (where g.result = 'win')::bigint,
         count(*) filter (where g.result = 'draw')::bigint,
         count(*) filter (where g.result = 'loss')::bigint,
         mode() within group (order by gp.path_uci)
  from public.game_positions gp
  join public.games g on g.id = gp.game_id
  where gp.side_to_move = g.player_color
    and gp.ply between 1 and p_max_ply
  group by gp.epd, g.player_color
  having count(*) >= p_min_games
  order by count(*) desc
$$;

revoke execute on function public.opening_position_stats(integer, integer) from public, anon;
grant execute on function public.opening_position_stats(integer, integer) to authenticated;

-- RPC : statistiques d'une seule position (joueur au trait) -------------------------------
create function public.opening_root_stats(p_epd text)
returns table (
  games bigint,
  wins bigint,
  draws bigint,
  losses bigint,
  top_path text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::bigint,
         count(*) filter (where g.result = 'win')::bigint,
         count(*) filter (where g.result = 'draw')::bigint,
         count(*) filter (where g.result = 'loss')::bigint,
         mode() within group (order by gp.path_uci)
  from public.game_positions gp
  join public.games g on g.id = gp.game_id
  where gp.epd = p_epd
    and gp.side_to_move = g.player_color
$$;

revoke execute on function public.opening_root_stats(text) from public, anon;
grant execute on function public.opening_root_stats(text) to authenticated;
