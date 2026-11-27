# 20261126033214_task_extension_requests.sql

<!-- One page per migration: its promotion entry and its rollback recipe.
     check:migration-safety reads the two headings below. Shared procedure
     lives in ../promotion.md and ../../db-rollback-playbook.md; link to it,
     don't copy it. -->

Asking for more time on a task, and a fixed deadline that rules it out (#6096; `spec/behavior/tasks.md` § Asking for more time).

## Promotion

- **Purpose**:
  - `tasks.fixed_deadline` and `task_series.fixed_deadline` (boolean, default false). `create_task_series` and `create_task_group` take a trailing `p_fixed_deadline` (default false). `insert_task_series_copy` and `add_task_group_copies` carry the flag onto each copy.
  - The new table `task_extension_requests`: one row per request, with at most one `pending` per task (partial unique index). RLS is on and there are no policies: only the API's service role reads or writes it.
  - `members.extension_requests_blocked_at` and `members.extension_requests_restored_at`.
- **Checks**:
  - `select count(*) from task_extension_requests;` returns 0.
  - `select fixed_deadline, count(*) from tasks group by 1;` shows every row false.
  - `\df+ create_task_group` shows the 16-argument signature, ending in `p_fixed_deadline boolean DEFAULT false`.
- **Promoter notes**:
  - Run it before the API that uses it.
  - An API revision still running from before the migration keeps working. It calls `create_task_group` and `create_task_series` with named arguments that leave out `p_fixed_deadline`, and the default fills it in.
  - It writes no data, and nothing is done by hand.

## Rollback

Revert only if the feature has to come out. The steps are:

1. Ship an API that no longer reads these columns.
2. Run a forward migration that drops them.
3. Restore the four functions to their `20261124034200` / `20261124035159` bodies.

Dropping the table loses every recorded extension; the due dates it moved stay moved. Decision matrix: [playbook](../../db-rollback-playbook.md#decision-matrix).

```sql
drop table if exists public.task_extension_requests;
alter table public.members
  drop column if exists extension_requests_blocked_at,
  drop column if exists extension_requests_restored_at;
drop function if exists public.create_task_series(uuid, uuid, text, text, uuid, int, text, text[], time, text, date, timestamptz, timestamptz, date, jsonb, boolean);
drop function if exists public.create_task_group(uuid, uuid, text, uuid[], text, text, date, timestamptz, int, text, text[], uuid, text, text, jsonb, boolean);
-- then re-create create_task_series, create_task_group, insert_task_series_copy
-- and add_task_group_copies from 20261124034200 and 20261124035159 before:
alter table public.tasks drop column if exists fixed_deadline;
alter table public.task_series drop column if exists fixed_deadline;
```
