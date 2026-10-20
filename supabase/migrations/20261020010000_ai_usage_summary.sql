-- Agrégat de consommation IA calculé en SQL (évite la limite de 1000 lignes de PostgREST).
-- security invoker : la RLS de ai_usage s'applique, l'utilisateur ne voit que ses lignes.
drop function if exists public.ai_usage_summary(timestamptz);

create function public.ai_usage_summary(since timestamptz)
returns table (
  calls bigint,
  cost_usd numeric,
  input_tokens bigint,
  output_tokens bigint,
  cache_read_tokens bigint,
  cache_write_tokens bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::bigint,
         coalesce(sum(u.cost_usd), 0)::numeric,
         coalesce(sum(u.input_tokens), 0)::bigint,
         coalesce(sum(u.output_tokens), 0)::bigint,
         coalesce(sum(u.cache_read_tokens), 0)::bigint,
         coalesce(sum(u.cache_write_tokens), 0)::bigint
  from public.ai_usage u
  where u.created_at >= since
$$;

revoke execute on function public.ai_usage_summary(timestamptz) from public, anon;
grant execute on function public.ai_usage_summary(timestamptz) to authenticated;

create index if not exists exercise_attempts_exercise_idx on public.exercise_attempts (exercise_id);
