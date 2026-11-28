-- Activity's poll, sign-up and form cards in one round trip (#6061 step 2,
-- after #5746 and step 1's `activity_task_reads`).
--
-- `GET /v1/activity` read its chat cards as up to eight PostgREST requests:
-- the chapter's newest polls, the caller's own newest polls, the newest
-- sign-up sheets and the newest forms (four scans of `chat_messages`), then
-- the caller's votes on those polls, every claim on the open sign-up sheets,
-- the caller's claims on the closed ones, and which forms the caller
-- answered. This function returns all of them at once; the API still decides
-- which rows a caller may see (the channels they can read, the members they
-- blocked) and assembles the page from them (`ActivityService.readPolls`,
-- `readCards`).
--
-- It reads `chat_messages` through `chat_channels` (for the chapter),
-- `chat_message_actions` and `chat_form_responses`, inside `p_chapter_id`.
-- The action and answer lists cover every scanned card, a superset of the
-- cards the API keeps, so the API filters them to the cards it keeps. Service
-- role only, and `security invoker`: it needs no privilege its caller lacks.
--
-- Keys, each a JSON array:
--   polls          the chapter's `p_limit` newest poll cards, newest first
--   own_polls      the caller's own `p_limit` newest poll cards, newest first
--   signups        the chapter's `p_limit` newest sign-up cards, newest first
--   forms          the chapter's `p_limit` newest form cards, newest first
--     (each card has the columns `CHAT_MESSAGE_COLUMNS` names; a deleted
--     message is never a card)
--   votes          the caller's vote rows on polls and own_polls:
--                  message_id, payload, created_at
--   signup_claims  every member's claim rows on signups, in id order:
--                  message_id, user_id, payload, created_at
--   form_answers   the caller's responses on forms: message_id, created_at
--                  (never what they wrote)

create or replace function public.activity_card_reads(
  p_chapter_id uuid,
  p_user_id    uuid,
  p_limit      integer
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  -- Not materialized: inlined into each scan below, so each one walks its
  -- kind's partial index newest first and stops at `p_limit`, as the
  -- separate reads did, instead of reading every message in the chapter.
  with chapter_cards as not materialized (
    select m.id, m.channel_id, m.sender_id, m.author_name,
           m.author_avatar_path, m.author_external_id, m.content, m.type,
           m.kind, m.payload, m.client_message_id, m.reply_to_id, m.metadata,
           m.mentions, m.thread_root_id, m.thread_reply_count,
           m.thread_last_reply_at, m.thread_recent_sender_ids,
           m.thread_last_reply, m.forwarded_from, m.is_pinned, m.pinned_at,
           m.flag, m.flagged_by, m.flagged_at, m.edited_at, m.is_deleted,
           m.created_at
      from chat_messages m
      join chat_channels c on c.id = m.channel_id
     where c.chapter_id = p_chapter_id
       and m.is_deleted = false
  ),
  polls as (
    select * from chapter_cards
     where kind = 'poll'
     order by created_at desc, id desc
     limit p_limit
  ),
  own_polls as (
    select * from chapter_cards
     where kind = 'poll' and sender_id = p_user_id
     order by created_at desc, id desc
     limit p_limit
  ),
  signups as (
    select * from chapter_cards
     where kind = 'signup'
     order by created_at desc, id desc
     limit p_limit
  ),
  forms as (
    select * from chapter_cards
     where kind = 'form'
     order by created_at desc, id desc
     limit p_limit
  ),
  votes as (
    select a.message_id, a.payload, a.created_at
      from chat_message_actions a
     where a.user_id = p_user_id
       and a.action_type = 'vote'
       and a.message_id in (select id from polls union select id from own_polls)
  ),
  signup_claims as (
    select a.id, a.message_id, a.user_id, a.payload, a.created_at
      from chat_message_actions a
     where a.action_type = 'signup'
       and a.message_id in (select id from signups)
  ),
  form_answers as (
    select r.message_id, r.created_at
      from chat_form_responses r
     where r.user_id = p_user_id
       and r.message_id in (select id from forms)
  )
  select jsonb_build_object(
    'polls', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc) from polls r),
      '[]'::jsonb),
    'own_polls', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc) from own_polls r),
      '[]'::jsonb),
    'signups', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc) from signups r),
      '[]'::jsonb),
    'forms', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc) from forms r),
      '[]'::jsonb),
    'votes', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.message_id) from votes r),
      '[]'::jsonb),
    'signup_claims', coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'message_id', r.message_id,
                  'user_id', r.user_id,
                  'payload', r.payload,
                  'created_at', r.created_at)
                order by r.id)
         from signup_claims r),
      '[]'::jsonb),
    'form_answers', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.message_id) from form_answers r),
      '[]'::jsonb)
  );
$$;

-- The service role only. `public` always exists; the Supabase roles are
-- absent in bare Postgres (PGlite in CI), so each is guarded.
revoke execute on function public.activity_card_reads(uuid, uuid, integer) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.activity_card_reads(uuid, uuid, integer) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.activity_card_reads(uuid, uuid, integer) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.activity_card_reads(uuid, uuid, integer) to service_role;
  end if;
end
$$;
