-- Bilans de partie générés par l'IA (cache, un par partie, version de prompt et modèle).
create table public.game_reports (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  prompt_version text not null,
  model text not null,
  content jsonb not null,
  verified boolean not null default true,
  -- Empreinte de l'analyse utilisée : un bilan est périmé si la partie a été réanalysée depuis.
  analysis_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (game_id, prompt_version, model)
);

alter table public.game_reports enable row level security;
create policy owner_all on public.game_reports for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_owner()))
  with check (user_id = (select auth.uid()) and (select public.is_owner()));
