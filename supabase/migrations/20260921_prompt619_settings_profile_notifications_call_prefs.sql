-- Prompt 619 — Profile & Display / Notifications / Call & Booking sections
-- on the closer Settings page. Columns only (self-service RPC pattern
-- matches update_own_timezone/update_own_theme_preference — profiles has
-- no self-UPDATE RLS policy, only profiles_update_admin).

alter table public.profiles
  add column phone text,
  add column notification_preferences jsonb not null default '{
    "new_lead_assigned": true,
    "call_booked": true,
    "call_rescheduled_canceled": true,
    "call_starting_soon": true
  }'::jsonb,
  add column call_reminder_lead_time text not null default '15m',
  add column auto_open_meeting_room boolean not null default false;

alter table public.profiles
  add constraint profiles_call_reminder_lead_time_check
  check (call_reminder_lead_time in ('15m', '30m', '1h'));

create or replace function public.update_own_full_name(p_full_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if trim(p_full_name) = '' then
    raise exception 'Name cannot be empty';
  end if;
  update profiles set full_name = trim(p_full_name) where id = auth.uid();
end;
$$;

create or replace function public.update_own_phone(p_phone text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update profiles set phone = nullif(trim(p_phone), '') where id = auth.uid();
end;
$$;

create or replace function public.update_own_notification_preferences(p_notification_preferences jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update profiles set notification_preferences = p_notification_preferences where id = auth.uid();
end;
$$;

create or replace function public.update_own_call_preferences(p_call_reminder_lead_time text, p_auto_open_meeting_room boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_call_reminder_lead_time not in ('15m', '30m', '1h') then
    raise exception 'Invalid reminder lead time';
  end if;
  update profiles
  set call_reminder_lead_time = p_call_reminder_lead_time,
      auto_open_meeting_room = p_auto_open_meeting_room
  where id = auth.uid();
end;
$$;
