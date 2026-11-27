# 20261127184653_api_wake_chat_push_catch_up.sql

<!-- One page per migration: its promotion entry and its rollback recipe.
     check:migration-safety reads the two headings below. Shared procedure
     lives in ../promotion.md and ../../db-rollback-playbook.md; link to it,
     don't copy it. -->

A chat message wakes a sleeping API, and the push worker catches up on the messages it missed (#6123, slice 1: chat pushes).

## Promotion

- **Purpose**:
  - The `pg_net` extension (schema `extensions`; its functions live in `net`), only where the server has it: hosted Supabase and the local stack do, CI's migration replays (PGlite, plain Postgres) don't, and there `wake_api()` does nothing.
  - The one-row table `api_wake` (`url`, `poked_at`). RLS is on with no policies: the API's service role writes it, and `wake_api()` reads it as its owner.
  - `wake_api()`: when `url` is set, sends `GET <url>/health` through `pg_net`, at most once a minute (the `poked_at` update is the claim). Errors become a warning, never an error.
  - A statement-level `AFTER INSERT` trigger on `chat_messages` (`chat_messages_wake_api`) that calls it.
  - `chat_push_unclaimed_messages(p_since, p_limit)`: recent messages with no `chat_push_dispatches` claim, for the push worker's catch-up. Service role only.
  - The index `idx_chat_messages_created_at`.
- **Checks**:
  - `select extname from pg_extension where extname = 'pg_net';` returns one row.
  - `select * from api_wake;` returns one row. `url` is null until the API that ships with this migration boots, then holds the environment's API origin (`https://api-staging.frapp.live` on staging).
  - Send a chat message, then `select poked_at from api_wake;` is within the last minute, and `select status_code, error_msg from net._http_response order by created desc limit 1;` is `200` once the request finishes (up to 30 s on a sleeping staging API, which has to cold-start first). On staging, the API's log then shows `chat-push: caught up on 1 message(s)` and the message's push arrives.
  - `select count(*) from chat_push_unclaimed_messages(now() - interval '15 minutes', 200);` returns, normally 0 on an API that is awake.
- **Promoter notes**:
  - Run it before the API that uses it. An older API never writes `url`, so `wake_api()` stays a no-op, and it never calls the catch-up function.
  - It writes only the one `api_wake` row. The index is built plainly (Supabase runs each migration in a transaction, so not `concurrently`), which holds a SHARE lock on `chat_messages` and **blocks every chat send until it finishes**. Staging's import is tens of thousands of rows, a few seconds; check `select count(*) from chat_messages;` on production first and promote in a quiet hour if it is large. The trigger's creation takes a brief lock on the same table.
  - Nothing is done by hand. Each environment's address comes from its API's own `API_URL` at boot.

## Rollback

Revert if the wake misbehaves (for example, `pg_net` requests piling up or failing inserts, which the exception handler should prevent). Dropping the trigger alone stops every wake and leaves the catch-up working, so try that first. A full revert, after shipping an API that no longer calls `chat_push_unclaimed_messages` or writes `api_wake` (the API logs and reports a failed catch-up read or wake-target write, and keeps running without them). Decision matrix: [playbook](../../db-rollback-playbook.md#decision-matrix).

```sql
drop trigger if exists chat_messages_wake_api on public.chat_messages;
drop function if exists public.chat_messages_wake_api();
drop function if exists public.wake_api();
drop function if exists public.chat_push_unclaimed_messages(timestamptz, integer);
drop index if exists public.idx_chat_messages_created_at;
drop table if exists public.api_wake;
-- Leave pg_net installed: dropping an extension other things may come to use
-- is its own decision.
```
