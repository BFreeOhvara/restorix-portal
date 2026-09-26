-- Prompt 649 — strategy calls are recorded from the closer's own browser
-- tab (src/lib/callRecorder.js), not Zoom cloud recording: the Zoom
-- account is free Basic, which has none. Same zoom_recordings table and
-- private call-recordings bucket as Prompt 647; the difference is that
-- the closer's browser now writes them, so it needs insert policies.
--
-- source       — 'zoom_cloud' (647 webhook, inert on Basic) or 'tab_capture'
-- part_number  — calls are saved in ~15-minute parts to stay under the
--                Free plan's 50MB per-file upload cap
-- zoom_file_id — only Zoom's cloud files have one

alter table zoom_recordings
  add column if not exists source text not null default 'zoom_cloud'
    check (source in ('zoom_cloud', 'tab_capture'));
alter table zoom_recordings
  add column if not exists part_number integer not null default 1 check (part_number >= 1);
alter table zoom_recordings alter column zoom_file_id drop not null;

-- A closer can only file a finished (stored/failed) tab-capture part for a
-- lead assigned to them, under their own {closer}/{lead}/ folder. No
-- update/delete — a part is written once, after its upload settles.
create policy "zoom_recordings_insert_own_tab_capture" on zoom_recordings
  for insert to authenticated
  with check (
    source = 'tab_capture'
    and zoom_file_id is null
    and closer_id = auth.uid()
    and status in ('stored', 'failed')
    and exists (
      select 1 from public.leads l
      where l.id = zoom_recordings.lead_id and l.assigned_closer = auth.uid()
    )
    and (
      storage_path is null
      or storage_path like auth.uid()::text || '/' || zoom_recordings.lead_id::text || '/%'
    )
  );

-- Upload into call-recordings/{own id}/{own assigned lead}/… only.
-- Reading back still goes through 647's select policy (needs the row).
create policy "call_recordings_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'call-recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.leads l
      where l.id::text = (storage.foldername(name))[2] and l.assigned_closer = auth.uid()
    )
  );
