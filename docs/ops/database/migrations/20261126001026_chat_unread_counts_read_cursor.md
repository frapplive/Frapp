# 20261126001026_chat_unread_counts_read_cursor.sql

<!-- One page per migration: its promotion entry and its rollback recipe.
     check:migration-safety reads the two headings below. Shared procedure
     lives in ../promotion.md and ../../db-rollback-playbook.md; link to it,
     don't copy it. -->

`get_channel_unread_counts` also returns the read cursor each count was taken from, `last_read_at`, so a thread can place its "New messages" divider (#6052).

## Promotion

- **Purpose**: the function's result gains a fourth column, `last_read_at timestamptz` (the caller's `channel_read_receipts.last_read_at`, null for a channel never opened). Its body is otherwise 20261112010000's. It is dropped and created again, since `create or replace` can't change a result type, and its grants are re-issued: execute for `service_role` only. Writes no rows.
- **Checks**: `select pg_get_function_result('public.get_channel_unread_counts(uuid,uuid)'::regprocedure);` ends in `last_read_at timestamp with time zone`; `select has_function_privilege('service_role', 'public.get_channel_unread_counts(uuid,uuid)', 'execute'), has_function_privilege('authenticated', 'public.get_channel_unread_counts(uuid,uuid)', 'execute');` is `t, f`; `GET /v1/channels/unread` still answers with the counts.
- **Promoter notes**: apply before the API that reads the column. The API before it reads the other three columns by name and ignores this one, so the order only matters for the divider. The drop and create run in the migration's one transaction, so no caller sees the function missing.

## Rollback

Not worth reverting on its own: an extra column breaks nothing. If it must go, a forward migration re-runs `20261112010000_chat_unread_counts_per_channel.sql`'s `create or replace` after dropping this one, and re-issues the same grants ([playbook](../../db-rollback-playbook.md#3-undo-one-migration)). The API then sends `last_read_at: null`, and the clients draw no divider.

```sql
drop function if exists public.get_channel_unread_counts(uuid, uuid);
-- then: the `create or replace function public.get_channel_unread_counts`
-- statement from 20261112010000_chat_unread_counts_per_channel.sql, verbatim,
-- and this migration's revoke/grant block.
```
