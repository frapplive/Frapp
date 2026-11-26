-- Unread counts also return the read cursor they were counted from (#6052).
--
-- A channel's thread draws a "New messages" divider above the first message
-- the member hadn't read, and a pill with the count pointing to it, as Discord
-- and Slack do. Opening the channel stamps the cursor to `now()`, so the thread
-- takes the cursor from the counts the app already holds as it opens, rather
-- than asking for it after the stamp. The count is still this function's; the
-- cursor only places the divider (`packages/chat-core/src/new-messages.ts`).
--
-- The body is 20261112010000's, unchanged but for the one output column:
-- `r.last_read_at` is the receipt row it already joins, so this adds no read.
-- A function's result type can't change under `create or replace`, so it is
-- dropped and created again, inside this migration's transaction. The API that
-- runs before this one reads three of the four columns by name and ignores the
-- fourth.

drop function if exists public.get_channel_unread_counts(uuid, uuid);

create function public.get_channel_unread_counts(
  p_chapter_id uuid,
  p_user_id    uuid
)
returns table (
  channel_id    uuid,
  unread_count  bigint,
  mention_count bigint,
  last_read_at  timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.id,
    unread.unread_count,
    unread.mention_count + thread_mentions.mention_count,
    -- The cursor the counts were taken from, null for a channel never opened
    -- (#6052): the thread places its "New messages" divider by it.
    r.last_read_at
  from chat_channels c
  left join channel_read_receipts r
    on r.channel_id = c.id
   and r.user_id = p_user_id
  cross join lateral (
    select
      count(*) as unread_count,
      count(*) filter (where p_user_id = any (m.mentions)) as mention_count
    from chat_messages m
    where m.channel_id = c.id
      -- A thread reply is not unread in its channel (#3785): it lives in the
      -- thread, and a followed thread shows its own count.
      and m.thread_root_id is null
      -- A deleted message is not unread.
      and m.is_deleted = false
      -- An imported archive message is never unread: it is history the
      -- chapter is importing, not a message anyone sent them.
      and m.kind <> 'imported'
      and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
      -- Your own messages are never unread to you. `is distinct from` because
      -- sender_id is nullable; a null-sender message is nobody's own.
      and m.sender_id is distinct from p_user_id
      -- A `#chapter-audit` entry is not unread (2026-11-06).
      and not (
        m.kind = 'system_audit'
        and coalesce(m.client_message_id, '') like 'audit:%'
      )
      -- A message from a member you have blocked in this chapter is not
      -- unread, and so not a mention (#2521).
      and not exists (
        select 1
          from chat_member_blocks b
         where b.chapter_id = p_chapter_id
           and b.blocker_user_id = p_user_id
           and b.blocked_user_id = m.sender_id
      )
  ) unread
  cross join lateral (
    -- A thread reply that @mentions you counts until you read the thread or
    -- the channel, whichever is later. Reading the channel clears it too, so a
    -- client without thread UI can never strand a badge, and the channel
    -- receipt bounds the scan to recent replies (the partial index on
    -- (channel_id, created_at)). Same skips as the channel count.
    select count(*) as mention_count
      from chat_messages t
      left join chat_thread_follows f
        on f.thread_root_id = t.thread_root_id
       and f.user_id = p_user_id
     where t.channel_id = c.id
       and t.thread_root_id is not null
       and p_user_id = any (t.mentions)
       and t.is_deleted = false
       and t.kind <> 'imported'
       and t.sender_id is distinct from p_user_id
       and not exists (
         select 1
           from chat_member_blocks b
          where b.chapter_id = p_chapter_id
            and b.blocker_user_id = p_user_id
            and b.blocked_user_id = t.sender_id
       )
       and t.created_at > coalesce(
         greatest(r.last_read_at, f.last_read_at),
         '-infinity'::timestamptz
       )
  ) thread_mentions
  where c.chapter_id = p_chapter_id;
$$;

-- Dropping the function dropped its grants with it, so they are issued again:
-- the service role only, as before. `public` always exists; the Supabase roles
-- are absent in bare Postgres (PGlite in CI), so each is guarded.
revoke execute on function public.get_channel_unread_counts(uuid, uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.get_channel_unread_counts(uuid, uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.get_channel_unread_counts(uuid, uuid) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.get_channel_unread_counts(uuid, uuid) to service_role;
  end if;
end
$$;
