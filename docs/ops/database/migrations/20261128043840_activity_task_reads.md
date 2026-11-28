# 20261128043840_activity_task_reads.sql

<!-- One page per migration: its promotion entry and its rollback recipe.
     check:migration-safety reads the two headings below. Shared procedure
     lives in ../promotion.md and ../../db-rollback-playbook.md; link to it,
     don't copy it. -->

Adds `activity_task_reads`, one function that returns every task list `GET /v1/activity` draws, with their groups and copies, so those come from one request instead of 13 for an officer and 4 for a member in `activity.service.reads.spec.ts`'s seed (#6061 step 1, after #5746). Two reads stay apart, as they were before: the live names of a role, chapter group or tier a drawn group went to, and requests for more time when the client asks for them.

## Promotion

- **Purpose**: a new `stable`, `security invoker` SQL function, `public.activity_task_reads(p_chapter_id uuid, p_user_id uuid, p_can_manage boolean, p_week_start timestamptz, p_limit integer) returns jsonb`, reading `tasks` and `task_groups` inside the chapter. Execute is granted to `service_role` only. No table changes, and no rows written.
- **Checks**: `select has_function_privilege('service_role', 'public.activity_task_reads(uuid,uuid,boolean,timestamptz,integer)', 'execute'), has_function_privilege('authenticated', 'public.activity_task_reads(uuid,uuid,boolean,timestamptz,integer)', 'execute');` is `t, f`; `select jsonb_object_keys(public.activity_task_reads(gen_random_uuid(), gen_random_uuid(), true, now(), 25));` lists `own`, `waiting`, `waiting_total`, `made`, `singles`, `made_groups`, `row_groups`, `copy_states` and `shared`; Activity opens for an officer with tasks.
- **Promoter notes**: apply before the API that calls it. The API before it doesn't call it, so applying early is harmless; an API that calls it against a database without it fails Activity's task section, which the page reports as unavailable while the rest draws.

## Rollback

Revert the API first (it calls the function on every Activity load), then drop the function with a forward migration ([playbook](../../db-rollback-playbook.md#3-undo-one-migration)). Nothing else depends on it, and it holds no data.

```sql
drop function if exists public.activity_task_reads(uuid, uuid, boolean, timestamptz, integer);
```
