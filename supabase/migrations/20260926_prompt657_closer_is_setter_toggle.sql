-- Prompt 657 — self-service "I also set" toggle for closer accounts.
-- Same self-service RPC pattern as update_own_timezone/update_own_phone
-- (Prompt 619) — profiles has no self-UPDATE RLS policy, only
-- profiles_update_admin, so every self-editable field gets its own
-- security-definer RPC scoped to auth.uid().

alter table public.profiles
  add column is_setter boolean not null default true;

create or replace function public.update_own_is_setter(p_is_setter boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update profiles set is_setter = p_is_setter where id = auth.uid();
end;
$$;
