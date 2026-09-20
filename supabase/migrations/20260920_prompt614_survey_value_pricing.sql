-- Prompt 614 — the two raw Closer Survey answers the value-based pricing
-- formula needs, persisted onto the lead so a deal's price survives closing
-- and reopening CloserLeadModal (same precedent as Prompt 612's
-- survey_front_runner/survey_sub_agents). Text, not numeric — these can hold
-- either a plain number string or one of Prompt 613's bracket strings, same
-- storage shape the survey state already uses.
alter table leads add column survey_missed_calls_per_week text;
alter table leads add column survey_admission_value text;
