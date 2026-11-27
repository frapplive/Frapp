# 20261125014448_minutes_action_item_tasks.sql

<!-- One page per migration: its promotion entry and its rollback recipe.
     check:migration-safety reads the two headings below. Shared procedure
     lives in ../promotion.md and ../../db-rollback-playbook.md; link to it,
     don't copy it. -->

Adds `meeting_action_item_tasks`, which links an action item of posted minutes to the task an officer made from it on the minutes screen (#6062).

## Promotion

- **Purpose**: a new, empty table keyed by `(meeting_id, item_key)`, so one action item gets one task however it got it (Suggested tasks link theirs through `ai_suggestions`). It names the task and, for one given to several people, its group, so taking one member off keeps the link. RLS on, no policies: only the API reads it.
- **Checks**: `select count(*) from public.meeting_action_item_tasks;` returns 0, and `select relrowsecurity from pg_class where relname = 'meeting_action_item_tasks';` returns `t`.
- **Promoter notes**: additive; apply before the API that writes it (`POST /v1/meetings/{id}/action-items/{index}/task`). An older API never reads it. Writes no data.

## Rollback

Worth reverting only with the API change: the table is new and nothing else reads it. Revert the API first, then run a forward migration
([playbook](../../db-rollback-playbook.md#decision-matrix)). Tasks already made stay; their items lose only their link to them.

```sql
drop table if exists public.meeting_action_item_tasks;
```
