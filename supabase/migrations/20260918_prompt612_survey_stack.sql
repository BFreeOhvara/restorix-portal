-- Prompt 612 — persists the Closer Survey's most recently completed result
-- onto the lead itself, so a deal's Stack (front-runner + sub-agents) is
-- durable across closing/reopening CloserLeadModal instead of living only
-- in that modal's local React state.
alter table leads add column survey_front_runner text;
alter table leads add column survey_sub_agents text[] not null default '{}';
