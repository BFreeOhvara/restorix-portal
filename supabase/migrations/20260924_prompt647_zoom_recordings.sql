-- Prompt 647 — real Zoom cloud recordings for closer strategy calls.
-- create-zoom-meeting now asks Zoom to cloud-record every strategy call
-- (settings.auto_recording = 'cloud'); zoom-recording-webhook receives
-- Zoom's recording.completed event, copies each MP4 into the private
-- call-recordings bucket and writes one row here per file.
--
-- Rows are written only by the webhook (service role) — no client
-- insert/update/delete policies. A closer reads their own rows, admin
-- reads all, same shape as calls_select_own_or_admin.

create table if not exists zoom_recordings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  closer_id uuid references profiles(id) on delete set null,
  zoom_meeting_id text not null,
  zoom_meeting_uuid text,
  -- Zoom's own per-file id; unique so a retried webhook delivery can't
  -- create a duplicate row for the same file.
  zoom_file_id text not null unique,
  storage_path text,
  file_size bigint,
  duration_seconds integer,
  recorded_at timestamptz,
  status text not null default 'processing' check (status in ('processing', 'stored', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists zoom_recordings_closer_idx on zoom_recordings (closer_id, recorded_at desc);
create index if not exists zoom_recordings_lead_idx on zoom_recordings (lead_id);

alter table zoom_recordings enable row level security;

create policy "zoom_recordings_select_own_or_admin" on zoom_recordings
  for select
  using (closer_id = auth.uid() or my_role() = 'admin');

-- Private bucket. No file_size_limit here, so the project's global
-- upload limit applies.
insert into storage.buckets (id, name, public)
values ('call-recordings', 'call-recordings', false)
on conflict (id) do nothing;

-- A signed URL can only be minted for an object whose recording row the
-- caller can see — the closer who ran the call, or admin.
create policy "call_recordings_select_own_or_admin" on storage.objects
  for select
  using (
    bucket_id = 'call-recordings'
    and exists (
      select 1 from public.zoom_recordings r
      where r.storage_path = storage.objects.name
        and (r.closer_id = auth.uid() or public.my_role() = 'admin')
    )
  );
