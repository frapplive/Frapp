# 20261128174419_activity_card_reads.sql

<!-- One page per migration: its promotion entry and its rollback recipe.
     check:migration-safety reads the two headings below. Shared procedure
     lives in ../promotion.md and ../../db-rollback-playbook.md; link to it,
     don't copy it. -->

Adds `activity_card_reads`, one function that returns the chat cards `GET /v1/activity` and its Archive draw (the chapter's newest polls, the caller's own newest polls, the newest sign-up sheets and forms) together with the caller's votes on those polls, every claim on those sign-ups and which of those forms the caller answered. They were up to eight requests, four of them scans of `chat_messages`, and are now one (#6061 step 2, after step 1's [`activity_task_reads`](20261128043840_activity_task_reads.md)).

## Promotion

- **Purpose**: a new `stable`, `security invoker` SQL function, `public.activity_card_reads(p_chapter_id uuid, p_user_id uuid, p_limit integer) returns jsonb`, reading `chat_messages` (through `chat_channels` for the chapter), `chat_message_actions` and `chat_form_responses`. Execute is granted to `service_role` only. Each kind's scan is inlined (`not materialized`) so it walks that kind's partial index (`idx_chat_messages_poll_cards`, `_signup_cards`, `_form_cards`) newest first, as the separate reads did. No table changes, and no rows written.
- **Checks**: `select has_function_privilege('service_role', 'public.activity_card_reads(uuid,uuid,integer)', 'execute'), has_function_privilege('authenticated', 'public.activity_card_reads(uuid,uuid,integer)', 'execute');` is `t, f`; `select jsonb_object_keys(public.activity_card_reads(gen_random_uuid(), gen_random_uuid(), 100));` lists `polls`, `own_polls`, `signups`, `forms`, `votes`, `signup_claims` and `form_answers`; Activity opens with its polls and cards for a member in a chapter that has some.
- **Promoter notes**: apply before the API that calls it. The API before it doesn't call it, so applying early is harmless; an API that calls it against a database without it fails Activity's polls and cards sections and the Archive's polls, which the page reports as unavailable while the rest draws.

## Rollback

Revert the API first (it calls the function on every Activity load), then drop the function with a forward migration ([playbook](../../db-rollback-playbook.md#3-undo-one-migration)). Nothing else depends on it, and it holds no data.

```sql
drop function if exists public.activity_card_reads(uuid, uuid, integer);
```
