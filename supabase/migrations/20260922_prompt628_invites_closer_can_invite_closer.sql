-- Prompt 628: closers can now invite closers, not just setters.
--
-- Only the allowed `role` set widens. The created_by = auth.uid() and
-- my_role() = 'closer' guards are unchanged, the separate
-- invites_insert_closer_client policy (role = 'client', Prompt 546) is
-- untouched, and closers still cannot create 'admin' invite rows.
--
-- Applied to the live project (avgvmzshujwphneykuvu) on 2026-09-22 and
-- verified via pg_policies before and after; this file is the tracked
-- record of that change, matching the repo's existing migration convention.

drop policy "invites_insert_closer" on public.invites;

create policy "invites_insert_closer"
  on public.invites
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and my_role() = 'closer'::user_role
    and role = any (array['setter'::user_role, 'closer'::user_role])
  );
