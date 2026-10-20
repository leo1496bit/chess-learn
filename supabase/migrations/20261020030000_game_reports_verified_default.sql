-- Un bilan n'est fiable que si le code l'a vérifié explicitement.
alter table public.game_reports alter column verified set default false;
