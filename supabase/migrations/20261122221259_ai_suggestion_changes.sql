-- What people change when they decide on a Frapp AI suggestion (Paul,
-- 2026-11-22: "we defo need to log what humans change when Frapp AI makes
-- suggestions. that's how we learn what is good and not good";
-- spec/behavior/ai.md § Stored AI text).
--
-- Until now a decided suggestion kept only `edited`, true or false, and its
-- proposal was emptied in the same write, so nobody could tell which field
-- was wrong or what it became. An Ask event card confirmed through its Edit
-- (the event form) kept only the new event's id.
--
-- 1. `ai_suggestions.ask_id`: the Ask turn that proposed the card, so a
--    change can be read beside that turn's trace (`ai_ask_traces.id`). No
--    foreign key: a trace is swept after 90 days and the link may outlive it.
--    `ai_suggestions.request_sealed`: the member's question, sealed with
--    `AI_STORED_TEXT_KEY` (never plaintext), held only while the card waits
--    and emptied with the rest of its text when it is decided: a trigger
--    empties it on any write that decides the card (so an API older than
--    this column can still decide one), and the redefined
--    `ai_suggestions_decided_hold_no_text` rule holds it.
--    `ai_suggestions.drew_on_chat`: the Ask turn had read channel messages
--    before it proposed the card. Their authors' words may be in it, so
--    the card's words are never sealed into the change log.
-- 2. `ai_suggestion_change_fields_ok(jsonb)`: holds `fields` to codes, ids
--    and numbers, so no sentence can be parked there by a bug upstream.
-- 3. `ai_suggestion_changes`: one row per decided suggestion. How it was
--    decided (accepted, dismissed, expired), whether through the card or the
--    full form, and field by field whether what was saved kept, changed,
--    added or removed what was proposed, with ids, numbers and minute shifts
--    for the fields that are not free text. `words_sealed` holds the
--    question, the proposed text and the saved text, sealed with
--    `AI_STORED_TEXT_KEY`, and only when the decider had said yes to Frapp
--    AI (Paul's pick, 2026-11-22). Without the key nothing is sealed and the
--    row keeps the changes alone.
--
-- When rows go. With the chapter, and with the decider's membership (they
-- left the chapter, or deleted their account, which removes their
-- memberships); with the membership of the member a card was made for (a
-- trigger on `members`); the API deletes a member's rows when they answer
-- No on the AI sheet; an hourly sweep deletes every row past `expires_at`, which the
-- check holds to at most 90 days. RLS on, no policies: the API reads and
-- writes with the service role, and only the Frapp team reads them.
--
-- Locks. Adding the columns (nullable, or a boolean with a constant
-- default, so no rewrite), a trigger, and re-adding a check take ACCESS
-- EXCLUSIVE on `ai_suggestions` and scan it once to validate the check. Its
-- rows are short once decided (no text), so on staging's and production's
-- sizes that is well under a second. The new foreign keys and the trigger on
-- `members` take SHARE ROW EXCLUSIVE on `chapters`, `members` and
-- `ai_suggestions` until commit, which blocks writes there, not reads.

-- 1. ------------------------------------------------------------------------

alter table public.ai_suggestions
  add column if not exists ask_id uuid,
  add column if not exists request_sealed text
    check (request_sealed is null or char_length(request_sealed) <= 12000),
  add column if not exists drew_on_chat boolean not null default false;

-- A decision empties the sealed question here, so an API that predates this
-- column (a rollout or a rollback) can still decide and expire cards: its
-- write leaves `request_sealed` alone and the check below would refuse it.
create or replace function public.ai_suggestions_drop_request_on_decide()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status not in ('pending', 'accepting') then
    new.request_sealed := null;
  end if;
  return new;
end;
$$;

-- A trigger needs no grant; nobody calls it as an RPC.
revoke all on function public.ai_suggestions_drop_request_on_decide()
  from public, anon, authenticated;

drop trigger if exists ai_suggestions_drop_request_on_decide
  on public.ai_suggestions;
create trigger ai_suggestions_drop_request_on_decide
  before insert or update of status on public.ai_suggestions
  for each row execute function public.ai_suggestions_drop_request_on_decide();

alter table public.ai_suggestions
  drop constraint if exists ai_suggestions_decided_hold_no_text;
alter table public.ai_suggestions
  add constraint ai_suggestions_decided_hold_no_text check (
    status in ('pending', 'accepting')
    or (
      payload = '{}'::jsonb
      and quote is null
      and quote_author_id is null
      and request_sealed is null
    )
  );

comment on column public.ai_suggestions.ask_id is
  'The Ask turn (ai_ask_traces.id) that proposed this card, when Ask did. No foreign key: the trace is swept first. See 20261122221259_ai_suggestion_changes.sql.';
comment on column public.ai_suggestions.request_sealed is
  'The member''s question, sealed with AI_STORED_TEXT_KEY, only while the card waits. See 20261122221259_ai_suggestion_changes.sql.';
comment on column public.ai_suggestions.drew_on_chat is
  'True when the Ask turn that proposed this card had read channel messages first: its words are never kept in the change log. See 20261122221259_ai_suggestion_changes.sql.';

-- 2. ------------------------------------------------------------------------

create or replace function public.ai_suggestion_change_value_ok(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_uuid constant text :=
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if jsonb_typeof(p_value) = 'array' then
    if jsonb_array_length(p_value) > 200 then
      return false;
    end if;
    for v_item in select a.value from jsonb_array_elements(p_value) a loop
      if not (
        jsonb_typeof(v_item) = 'number'
        or (jsonb_typeof(v_item) = 'string' and (v_item #>> '{}') ~ v_uuid)
      ) then
        return false;
      end if;
    end loop;
    return true;
  end if;
  return jsonb_typeof(p_value) in ('number', 'boolean', 'null')
    or (jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') ~ v_uuid);
end;
$$;

create or replace function public.ai_suggestion_change_fields_ok(p_fields jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text;
  v_change jsonb;
  v_key text;
  v_value jsonb;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    return false;
  end if;
  if (select count(*) from jsonb_object_keys(p_fields)) > 40 then
    return false;
  end if;
  for v_name, v_change in select e.key, e.value from jsonb_each(p_fields) e loop
    if v_name !~ '^[a-z][a-z0-9_]{0,47}$' or jsonb_typeof(v_change) <> 'object' then
      return false;
    end if;
    if (v_change ->> 'verdict') is null
      or (v_change ->> 'verdict') not in ('kept', 'changed', 'added', 'removed') then
      return false;
    end if;
    for v_key, v_value in select c.key, c.value from jsonb_each(v_change) c loop
      if v_key = 'verdict' then
        continue;
      end if;
      if v_key not in ('proposed', 'saved', 'delta_minutes') then
        return false;
      end if;
      if not public.ai_suggestion_change_value_ok(v_value) then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

comment on function public.ai_suggestion_change_fields_ok(jsonb) is
  'True when a change log''s fields are at most 40 snake_case names, each {verdict: kept|changed|added|removed} with optional proposed, saved and delta_minutes holding only numbers, booleans, nulls, uuids or arrays (at most 200) of numbers and uuids. No text. See 20261122221259_ai_suggestion_changes.sql.';

-- 3. ------------------------------------------------------------------------

create table if not exists public.ai_suggestion_changes (
  suggestion_id uuid primary key references ai_suggestions(id) on delete cascade,
  chapter_id uuid not null references chapters(id) on delete cascade,
  -- Who decided, as their membership: leaving the chapter or deleting the
  -- account takes the row. Null for a suggestion that expired undecided.
  member_id uuid references members(id) on delete cascade,
  decided_by uuid,
  requested_for uuid,
  ask_id uuid,
  kind text not null,
  source_type text not null,
  decision text not null,
  -- `card`: confirmed as shown or with the card's own fields; `form`: made in
  -- the full event or task form the card's Edit opened.
  via text,
  fields jsonb not null default '{}'::jsonb,
  words_sealed text,
  decided_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint ai_suggestion_changes_kind_is_a_code
    check (kind ~ '^[a-z][a-z0-9_]{0,31}$'),
  constraint ai_suggestion_changes_source_type_is_a_code
    check (source_type ~ '^[a-z][a-z0-9_]{0,31}$'),
  constraint ai_suggestion_changes_decision_known
    check (decision in ('accepted', 'dismissed', 'expired')),
  constraint ai_suggestion_changes_via_known
    check (via is null or via in ('card', 'form')),
  constraint ai_suggestion_changes_decider
    check ((decision = 'expired') = (decided_by is null)),
  constraint ai_suggestion_changes_fields_are_codes
    check (public.ai_suggestion_change_fields_ok(fields)),
  constraint ai_suggestion_changes_words_size
    check (words_sealed is null or char_length(words_sealed) <= 120000),
  constraint ai_suggestion_changes_at_most_90_days
    check (expires_at > decided_at and expires_at <= decided_at + interval '90 days')
);

create index if not exists ai_suggestion_changes_chapter_decided
  on public.ai_suggestion_changes (chapter_id, decided_at desc);
create index if not exists ai_suggestion_changes_member
  on public.ai_suggestion_changes (member_id);
-- A No on the AI sheet: the rows they decided, and the ones made for them.
create index if not exists ai_suggestion_changes_decided_by
  on public.ai_suggestion_changes (decided_by);
create index if not exists ai_suggestion_changes_requested_for
  on public.ai_suggestion_changes (requested_for);
create index if not exists ai_suggestion_changes_ask
  on public.ai_suggestion_changes (ask_id)
  where ask_id is not null;
create index if not exists ai_suggestion_changes_expires_at
  on public.ai_suggestion_changes (expires_at);

alter table public.ai_suggestion_changes enable row level security;

-- Leaving the chapter (or deleting the account, which removes every
-- membership) also takes what was kept for that member as the one a card was
-- made for: the sealed question on their waiting cards, and the change log
-- rows of cards someone else decided for them. Rows they decided go by the
-- `member_id` foreign key.
create or replace function public.ai_suggestion_changes_member_left()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Not security definer: memberships are deleted by the API's service role
  -- and by `anonymize_user`, both of which may write these tables.
  update public.ai_suggestions
     set request_sealed = null
   where chapter_id = old.chapter_id
     and requested_for = old.user_id
     and request_sealed is not null;
  delete from public.ai_suggestion_changes
   where chapter_id = old.chapter_id
     and requested_for = old.user_id;
  return old;
end;
$$;

revoke all on function public.ai_suggestion_changes_member_left()
  from public, anon, authenticated;

drop trigger if exists ai_suggestion_changes_member_left on public.members;
create trigger ai_suggestion_changes_member_left
  after delete on public.members
  for each row execute function public.ai_suggestion_changes_member_left();

comment on table public.ai_suggestion_changes is
  'What a person changed when deciding on an AI suggestion: codes, ids and numbers, plus the words sealed with AI_STORED_TEXT_KEY when the decider said yes to Frapp AI. Deleted after at most 90 days. API only; the Frapp team reads it. See 20261122221259_ai_suggestion_changes.sql.';
