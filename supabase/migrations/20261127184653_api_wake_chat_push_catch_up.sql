-- Wake the API when a chat message arrives, and let the push worker catch up
-- on the messages it missed (#6123, slice 1: chat pushes).
--
-- Staging's API runs on Cloud Run at min 0. About 15 minutes after its last
-- request the instance stops, and with it the push worker's Realtime
-- subscription, so a message sent while it slept was never pushed. Raising
-- min to 1 costs about $45 a month (Paul ruled it out, 2026-11-26).
--
-- 1. `pg_net`, so the database can make an outbound HTTP request.
-- 2. `api_wake`: one row holding the API's own address, which the API writes
--    at boot (`ApiWakeTargetService`), and when the database last poked it.
-- 3. `wake_api()`: sends `GET <url>/health` through `pg_net`, at most once a
--    minute. `pg_net` queues the request and sends it after the transaction
--    commits, so nothing waits on it, and a failure never fails the caller.
--    Its timeout outlasts a cold start (about 10 to 20 seconds), so the
--    response row says whether the wake landed.
-- 4. A statement trigger on `chat_messages` that calls it. Cloud Run starts an
--    instance for the request, and the push worker catches up on boot (5).
-- 5. `chat_push_unclaimed_messages(since, limit)`: the recent messages with
--    no `chat_push_dispatches` claim, for the push worker to run through its
--    usual claim each time its subscription (re)joins.
-- 6. An index on `chat_messages (created_at)` for that read.
--
-- Production runs at min 1, so its API is always awake and the poke is a
-- request it answers; the code path is the same on both.

-- Only where the server ships it. Hosted Supabase and the local stack do; the
-- migration replays in CI (PGlite, and the plain Postgres image the role-lock
-- race check uses) don't, and can't, since pg_net needs a background worker.
-- Without it `wake_api()` reaches its exception handler and does nothing.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end
$$;

create table if not exists public.api_wake (
  -- One row only.
  id boolean primary key default true check (id),
  -- The API's public origin, written by the API at boot. Null until then, and
  -- on a database no deployed API has booted against (local, CI), which keeps
  -- `wake_api()` a no-op there.
  url text,
  -- When `wake_api()` last sent a request: the once-a-minute limit.
  poked_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.api_wake enable row level security;
-- No policies: the API's service role writes it, and `wake_api()` reads it as
-- its owner. Members have nothing to read here.
revoke all on table public.api_wake from anon, authenticated;

insert into public.api_wake (id) values (true) on conflict (id) do nothing;

create or replace function public.wake_api()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url text;
begin
  -- Claim the minute: only the caller whose update matches sends, so a burst
  -- of messages sends one request, and concurrent callers don't each send.
  update public.api_wake
     set poked_at = now()
   where id
     and url is not null
     and (poked_at is null or poked_at < now() - interval '60 seconds')
  returning url into v_url;

  if v_url is null then
    return;
  end if;

  -- `/health` is the liveness route: public, cheap, always 2xx while the
  -- process is up. The request is what matters; its answer is never read.
  perform net.http_get(
    url := rtrim(v_url, '/') || '/health',
    timeout_milliseconds := 30000
  );
exception
  when others then
    -- A wake is best effort. It must never fail the insert that called it.
    raise warning 'wake_api: % (%)', sqlerrm, sqlstate;
end;
$$;

revoke execute on function public.wake_api() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.wake_api() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.wake_api() from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.wake_api() to service_role;
  end if;
end
$$;

create or replace function public.chat_messages_wake_api()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.wake_api();
  return null;
end;
$$;

-- A trigger needs no grant, so nobody gets one (#830).
revoke execute on function public.chat_messages_wake_api() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.chat_messages_wake_api() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.chat_messages_wake_api() from authenticated;
  end if;
end
$$;

-- Per statement, not per row: a Discord import inserting thousands of rows in
-- one statement pokes at most once.
drop trigger if exists chat_messages_wake_api on public.chat_messages;
create trigger chat_messages_wake_api
  after insert on public.chat_messages
  for each statement
  execute function public.chat_messages_wake_api();

-- Serves the catch-up read below (messages since a time, across chapters).
create index if not exists idx_chat_messages_created_at
  on public.chat_messages (created_at);

create or replace function public.chat_push_unclaimed_messages(
  p_since timestamptz,
  p_limit integer
)
returns setof public.chat_messages
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- The kinds the push worker drops before its claim (imported archive rows,
  -- posted Frapp Intelligence answers) are left out here too, or every
  -- catch-up would read them again.
  select m.*
    from public.chat_messages m
   where m.created_at >= p_since
     and m.is_deleted = false
     and m.kind not in ('imported', 'ask_answer')
     and not exists (
       select 1
         from public.chat_push_dispatches d
        where d.message_id = m.id
     )
   order by m.created_at
   limit least(greatest(coalesce(p_limit, 1), 1), 500);
$$;

revoke execute on function public.chat_push_unclaimed_messages(timestamptz, integer) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.chat_push_unclaimed_messages(timestamptz, integer) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.chat_push_unclaimed_messages(timestamptz, integer) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.chat_push_unclaimed_messages(timestamptz, integer) to service_role;
  end if;
end
$$;
