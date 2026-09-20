-- Prompt 617 — a closer can disconnect their own Zoom account. The
-- existing closer_zoom_tokens RLS only had a SELECT policy (closer reads
-- their own row, admin reads any); there was no way for a closer to
-- remove their own row at all, so Settings could only ever show
-- "Connected" once one existed. Narrowest fix: a DELETE policy scoped to
-- the caller's own row, same shape as the existing SELECT policy — no new
-- edge function needed since this is a plain "delete your own record"
-- operation, not something requiring service-role privilege.
create policy "closer_zoom_tokens_delete" on closer_zoom_tokens
  for delete
  using (closer_id = auth.uid());
