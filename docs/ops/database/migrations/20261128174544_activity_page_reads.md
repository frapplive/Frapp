# 20261128174544_activity_page_reads.sql

<!-- One page per migration: its promotion entry and its rollback recipe.
     check:migration-safety reads the two headings below. Shared procedure
     lives in ../promotion.md and ../../db-rollback-playbook.md; link to it,
     don't copy it. -->

Adds `activity_page_reads`, one function that returns what `GET /v1/activity` read as eight requests beside its tasks and events: the chat card scans (polls, the caller's own polls, sign-ups, forms), the caller's reminders (due and waiting), their snoozes and their unread start (#6061 step 2, after `activity_task_reads`). On the local demo chapter a load goes from 25 PostgREST requests to 18. Which cards the caller may see is still the API's decision, from the channel list and the block list, which stay their own reads.

## Promotion

- **Purpose**: a new `stable`, `security invoker` SQL function, `public.activity_page_reads(p_chapter_id uuid, p_user_id uuid, p_now timestamptz, p_snoozes_ended_after timestamptz, p_polls boolean, p_poll_limit integer, p_card_limit integer, p_reminder_limit integer) returns jsonb`, reading `chat_messages`, `chat_channels`, `chat_message_reminders`, `activity_item_snoozes` and `activity_unread_starts`. Execute is granted to `service_role` only. No table changes, and no rows written.
- **Checks**: `select has_function_privilege('service_role', 'public.activity_page_reads(uuid,uuid,timestamptz,timestamptz,boolean,integer,integer,integer)', 'execute'), has_function_privilege('authenticated', 'public.activity_page_reads(uuid,uuid,timestamptz,timestamptz,boolean,integer,integer,integer)', 'execute');` is `t, f`; `select jsonb_object_keys(public.activity_page_reads(gen_random_uuid(), gen_random_uuid(), now(), now(), true, 100, 100, 50));` lists `polls`, `own_polls`, `signups`, `forms`, `reminders`, `snoozes` and `unread_since`; Activity opens with its polls, cards and reminders.
- **Promoter notes**: apply before the API that calls it. The API before it doesn't call it, so applying early is harmless; an API that calls it against a database without it serves Activity with polls, cards and reminders named unavailable, nothing snoozed and no unread dots, while the rest draws.

## Rollback

Revert the API first (it calls the function on every Activity load), then drop the function with a forward migration ([playbook](../../db-rollback-playbook.md#3-undo-one-migration)). Nothing else depends on it, and it holds no data.

```sql
drop function if exists public.activity_page_reads(uuid, uuid, timestamptz, timestamptz, boolean, integer, integer, integer);
```
