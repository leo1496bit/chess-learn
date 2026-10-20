-- Départage déterministe des réponses adverses de même fréquence (par coup UCI) : l'arbre d'une ligne
-- est recalculé à chaque étape de construction et ne doit pas dépendre de l'ordre de lecture.
-- Même signature, même sécurité et mêmes droits que dans 20261021000000_opening_lines.sql.
create or replace function public.opening_reply_stats(p_epd text)
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
  order by count(*) desc, gp.move_uci
$$;

revoke execute on function public.opening_reply_stats(text) from public, anon;
grant execute on function public.opening_reply_stats(text) to authenticated;
