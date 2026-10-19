-- chess-learn : schéma initial
-- Toutes les tables appartiennent à un utilisateur (auth.users) et sont protégées par RLS.
-- is_owner() restreint en plus l'accès à l'adresse autorisée (application mono-utilisateur).

create or replace function public.is_owner()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'email') = 'landrydam@gmail.com', false)
$$;

-- Paramètres utilisateur ---------------------------------------------------
create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  chesscom_username text not null default 'Leny_l',
  engine_depth integer not null default 16 check (engine_depth between 8 and 30),
  engine_multipv integer not null default 3 check (engine_multipv between 1 and 5),
  -- seuils de perte de % de gain (voir skill chess-analysis §4)
  thresholds jsonb not null default '{"excellent":2,"good":5,"inaccuracy":5,"mistake":10,"blunder":20}'::jsonb,
  ai_daily_call_limit integer not null default 50 check (ai_daily_call_limit >= 0),
  ai_monthly_budget_usd numeric(10, 4) not null default 1.00 check (ai_monthly_budget_usd >= 0),
  ai_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Archives Chess.com déjà synchronisées --------------------------------------
create table public.chesscom_archives (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url text not null,
  etag text,
  last_modified text,
  game_count integer not null default 0,
  last_synced_at timestamptz not null default now(),
  primary key (user_id, url)
);

-- Parties -----------------------------------------------------------------
create table public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chesscom_uuid text not null,
  chesscom_url text,
  pgn text not null,
  white text not null,
  black text not null,
  white_rating integer,
  black_rating integer,
  player_color text not null check (player_color in ('w', 'b')),
  result text not null check (result in ('win', 'loss', 'draw')),
  result_detail text,
  time_class text,
  time_control text,
  rules text not null default 'chess',
  rated boolean,
  eco text,
  opening_name text,
  end_time timestamptz not null,
  ply_count integer not null default 0,
  analysis_status text not null default 'none' check (analysis_status in ('none', 'running', 'done', 'error')),
  player_accuracy numeric(5, 2),
  opponent_accuracy numeric(5, 2),
  imported_at timestamptz not null default now(),
  unique (user_id, chesscom_uuid)
);
create index games_user_end_time_idx on public.games (user_id, end_time desc);

-- Cache des analyses de positions (jamais recalculées) --------------------
create table public.position_analyses (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fen text not null,
  depth integer not null,
  multipv integer not null,
  engine_version text not null,
  lines jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, fen, depth, multipv, engine_version)
);

-- Analyse d'une partie --------------------------------------------------
create table public.game_analyses (
  game_id uuid primary key references public.games (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  depth integer not null,
  multipv integer not null,
  engine_version text not null,
  thresholds jsonb not null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.move_analyses (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ply integer not null check (ply >= 1),
  color text not null check (color in ('w', 'b')),
  is_player_move boolean not null,
  san text not null,
  uci text not null,
  fen_before text not null,
  fen_after text not null,
  eval_before jsonb not null,
  eval_after jsonb not null,
  best_uci text,
  best_san text,
  candidates jsonb not null default '[]'::jsonb,
  punish_line jsonb not null default '[]'::jsonb,
  win_before numeric(6, 2) not null,
  win_after numeric(6, 2) not null,
  loss numeric(6, 2) not null,
  accuracy numeric(6, 2) not null,
  classification text not null check (classification in ('best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder', 'forced')),
  missed_win boolean not null default false,
  missed_save boolean not null default false,
  phase text not null check (phase in ('opening', 'middlegame', 'endgame')),
  themes text[] not null default '{}',
  unique (game_id, ply)
);
create index move_analyses_user_class_idx on public.move_analyses (user_id, classification) where is_player_move;

-- Explications IA (cache) -------------------------------------------------
create table public.explanations (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  game_id uuid references public.games (id) on delete cascade,
  ply integer,
  exercise_id uuid,
  prompt_version text not null,
  model text not null,
  content jsonb not null,
  verified boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index explanations_move_key on public.explanations (game_id, ply, prompt_version, model) where game_id is not null;

-- Suivi des appels IA et des coûts ---------------------------------------
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  purpose text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  status text not null check (status in ('ok', 'error', 'refused', 'unverified')),
  error text
);
create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);

-- Exercices -------------------------------------------------------------
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_move_id bigint not null unique references public.move_analyses (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  fen text not null,
  side_to_move text not null check (side_to_move in ('w', 'b')),
  played_uci text not null,
  solution_uci text not null,
  solution_san text not null,
  solution_line jsonb not null default '[]'::jsonb,
  accepted_uci text[] not null default '{}',
  themes text[] not null default '{}',
  phase text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  created_at timestamptz not null default now(),
  due_at timestamptz not null default now(),
  interval_days numeric(8, 2) not null default 0,
  attempts integer not null default 0,
  successes integer not null default 0,
  last_result text check (last_result in ('correct', 'incorrect'))
);
create index exercises_user_due_idx on public.exercises (user_id, due_at);

alter table public.explanations
  add constraint explanations_exercise_fk foreign key (exercise_id) references public.exercises (id) on delete cascade;

create table public.exercise_attempts (
  id bigint generated always as identity primary key,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  answer_uci text not null,
  answer_san text,
  correct boolean not null,
  loss numeric(6, 2),
  created_at timestamptz not null default now()
);
create index exercise_attempts_user_idx on public.exercise_attempts (user_id, created_at desc);

-- RLS ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['settings', 'chesscom_archives', 'games', 'position_analyses', 'game_analyses',
                           'move_analyses', 'explanations', 'ai_usage', 'exercises', 'exercise_attempts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy owner_all on public.%I for all to authenticated
         using (user_id = (select auth.uid()) and (select public.is_owner()))
         with check (user_id = (select auth.uid()) and (select public.is_owner()))', t);
  end loop;
end $$;
