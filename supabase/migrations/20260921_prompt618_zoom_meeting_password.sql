-- Prompt 618 — Zoom Meeting SDK embed
-- The SDK's client.join() wants a bare meeting number + password, not a
-- join URL. zoom_meeting_id already existed (Prompt 529); this adds the
-- matching password so create-zoom-meeting/get-zoom-personal-room can
-- return both without re-parsing them out of a stored join URL.
alter table leads add column if not exists zoom_meeting_password text;
