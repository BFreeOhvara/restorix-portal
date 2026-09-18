-- Prompt 611 — lightweight "request payment method change" flow. Mirrors
-- bug_reports' shape/RLS exactly (own-row insert/select for the client,
-- full read/update for admin). No payment data of any kind — this table
-- only logs that a client asked, so the team can follow up manually.
create table billing_requests (
  id uuid primary key default gen_random_uuid(),
  client_profile_id uuid not null references profiles(id),
  note text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table billing_requests enable row level security;

create policy billing_requests_insert_own on billing_requests
  for insert with check (client_profile_id = auth.uid());

create policy billing_requests_select_own_or_admin on billing_requests
  for select using (client_profile_id = auth.uid() or my_role() = 'admin'::user_role);

create policy billing_requests_update_admin on billing_requests
  for update using (my_role() = 'admin'::user_role) with check (my_role() = 'admin'::user_role);
