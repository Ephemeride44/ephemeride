-- Qui a créé un événement : id du compte connecté au moment de la proposition.
-- Les propositions anonymes gardent NULL. Distinct de `createdby` (jsonb), qui
-- stocke le nom et l'e-mail saisis dans le formulaire public.
alter table public.events
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists events_created_by_idx on public.events (created_by);

-- Nom et e-mail du compte créateur de chaque événement demandé. Réservé à
-- l'admin : super admin, ou admin de l'organisation de l'événement. Les
-- événements hors de son périmètre ne renvoient aucune ligne.
create or replace function public.get_event_creators(p_event_ids uuid[])
returns table (
  event_id uuid,
  user_id uuid,
  email text,
  full_name text
)
language sql
security definer
set search_path to 'public'
as $$
  select
    e.id,
    e.created_by,
    u.email::text,
    coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')
  from public.events e
  join auth.users u on u.id = e.created_by
  where e.id = any(p_event_ids)
    and (
      public.is_super_admin(auth.uid())
      or (e.organization_id is not null and public.is_organization_admin(auth.uid(), e.organization_id))
    );
$$;

alter function public.get_event_creators(uuid[]) owner to postgres;
revoke execute on function public.get_event_creators(uuid[]) from anon;
grant execute on function public.get_event_creators(uuid[]) to authenticated;
