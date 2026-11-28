-- Activity's chat cards, reminders and the member's marks in one round trip
-- (#6061 step 2, after `activity_task_reads`).
--
-- `GET /v1/activity` read these as eight PostgREST requests: four card scans
-- (the chapter's polls, the caller's own polls, sign-ups and forms), the
-- caller's reminders twice (the due ones and the waiting ones), their
-- snoozes, and when their unread dots began, which was read after every
-- other section had finished. The database answers each in a few
-- milliseconds; the cost was the round trips. This function returns them all
-- at once, each filtered, ordered and capped as the separate reads were, and
-- the API assembles the page from them as before (`ActivityService`).
--
-- It decides nothing about access. The card scans are the chapter's, as
-- they were: the API keeps only the cards in a channel the caller can read
-- (`ChatService.getChannels`) and leaves out a blocked author's
-- (`ChatBlockService`), and the reminders, snoozes and unread start are the
-- caller's own rows. Service role only, and `security invoker`: it needs no
-- privilege its caller lacks.
--
-- Keys, each a JSON array of rows unless noted:
--   polls          the chapter's `p_poll_limit` newest polls, every column
--                  `CHAT_MESSAGE_COLUMNS` reads; empty unless `p_polls`
--   own_polls      the caller's own `p_poll_limit` newest polls, the same
--                  columns; empty unless `p_polls`
--   signups        the chapter's `p_card_limit` newest sign-up sheets
--   forms          the chapter's `p_card_limit` newest forms
--   reminders      the caller's `p_reminder_limit` latest due reminders,
--                  latest first, then their `p_reminder_limit` soonest
--                  waiting ones, soonest first; each with its message under
--                  `message`, in a bookmark's columns plus `metadata`
--   snoozes        the caller's snoozes that end after `p_snoozes_ended_after`
--   unread_since   when the caller's unread dots began (a timestamp, or null)

create or replace function public.activity_page_reads(
  p_chapter_id           uuid,
  p_user_id              uuid,
  p_now                  timestamptz,
  p_snoozes_ended_after  timestamptz,
  p_polls                boolean,
  p_poll_limit           integer,
  p_card_limit           integer,
  p_reminder_limit       integer
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with cards as not materialized (
    -- The columns `CHAT_MESSAGE_COLUMNS` names, so a card served from here
    -- is the message `findCardsByChapter` served, and no search vector rides
    -- along. Chapter scope through the channel, as `chat_messages` carries
    -- no `chapter_id` of its own.
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
    select * from cards
     where p_polls and kind = 'poll'
     order by created_at desc
     limit p_poll_limit
  ),
  own_polls as (
    select * from cards
     where p_polls and kind = 'poll' and sender_id = p_user_id
     order by created_at desc
     limit p_poll_limit
  ),
  signups as (
    select * from cards
     where kind = 'signup'
     order by created_at desc
     limit p_card_limit
  ),
  forms as (
    select * from cards
     where kind = 'form'
     order by created_at desc
     limit p_card_limit
  ),
  mine as not materialized (
    select r.id, r.user_id, r.message_id, r.chapter_id, r.remind_at,
           r.fired_at, r.created_at, r.updated_at,
           -- A bookmark's columns plus `metadata`
           -- (`REMINDER_MESSAGE_COLUMNS`), with the GIF under `gif` as the
           -- PostgREST read's `gif:metadata->gif` put it.
           jsonb_build_object(
             'id', m.id,
             'channel_id', m.channel_id,
             'sender_id', m.sender_id,
             'author_name', m.author_name,
             'author_avatar_path', m.author_avatar_path,
             'author_external_id', m.author_external_id,
             'content', m.content,
             'is_deleted', m.is_deleted,
             'created_at', m.created_at,
             'thread_root_id', m.thread_root_id,
             'forwarded_from', m.forwarded_from,
             'gif', m.metadata -> 'gif',
             'metadata', m.metadata
           ) as message
      from chat_message_reminders r
      join chat_messages m on m.id = r.message_id
     where r.user_id = p_user_id
       and r.chapter_id = p_chapter_id
  ),
  due as (
    select * from mine
     where remind_at <= p_now
     order by remind_at desc
     limit p_reminder_limit
  ),
  waiting as (
    select * from mine
     where remind_at > p_now
     order by remind_at asc
     limit p_reminder_limit
  ),
  snoozes as (
    select s.*
      from activity_item_snoozes s
     where s.chapter_id = p_chapter_id
       and s.user_id = p_user_id
       and s.until > p_snoozes_ended_after
  )
  select jsonb_build_object(
    'polls', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.created_at desc) from polls r),
      '[]'::jsonb),
    'own_polls', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.created_at desc) from own_polls r),
      '[]'::jsonb),
    'signups', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.created_at desc) from signups r),
      '[]'::jsonb),
    'forms', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.created_at desc) from forms r),
      '[]'::jsonb),
    'reminders', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.remind_at desc) from due r),
      '[]'::jsonb)
      || coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.remind_at asc) from waiting r),
      '[]'::jsonb),
    'snoozes', coalesce(
      (select jsonb_agg(to_jsonb(r)) from snoozes r),
      '[]'::jsonb),
    'unread_since', (
      select to_jsonb(u.started_at)
        from activity_unread_starts u
       where u.chapter_id = p_chapter_id
         and u.user_id = p_user_id
    )
  );
$$;

-- The service role only. `public` always exists; the Supabase roles are
-- absent in bare Postgres (PGlite in CI), so each is guarded.
revoke execute on function public.activity_page_reads(uuid, uuid, timestamptz, timestamptz, boolean, integer, integer, integer) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.activity_page_reads(uuid, uuid, timestamptz, timestamptz, boolean, integer, integer, integer) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.activity_page_reads(uuid, uuid, timestamptz, timestamptz, boolean, integer, integer, integer) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.activity_page_reads(uuid, uuid, timestamptz, timestamptz, boolean, integer, integer, integer) to service_role;
  end if;
end
$$;
