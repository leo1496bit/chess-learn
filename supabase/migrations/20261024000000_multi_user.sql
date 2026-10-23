-- Ouverture à plusieurs utilisateurs (bêta) : tout utilisateur connecté accède à ses propres lignes.
-- Les politiques owner_all gardent `user_id = auth.uid()` ; is_owner() ne filtre plus sur l'adresse.

create or replace function public.is_owner()
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select auth.uid()) is not null
$$;

-- L'identifiant Chess.com est saisi à la première connexion : plus de valeur par défaut.
alter table public.settings alter column chesscom_username drop default;
