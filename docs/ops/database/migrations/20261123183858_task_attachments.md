# 20261123183858_task_attachments.sql

Adds `attachments` (a list of Frapp links) to tasks and repeating-task templates, and carries it through `create_task_group`, `create_task_series` and `insert_task_series_copy` (Paul 2026-11-22, `spec/behavior/frapp-links.md`).

## Promotion

- **Purpose**: `tasks.attachments` and `task_series.attachments` are `jsonb not null default '[]'`, each checked to be a list of at most 10. A group's copies are written with the same list; a series' copies are made with its template's. Both writer functions take `p_attachments jsonb default '[]'` as a trailing argument.
- **Checks**:
  ```sql
  select column_name, data_type, column_default
    from information_schema.columns
   where table_schema = 'public' and table_name in ('tasks', 'task_series')
     and column_name = 'attachments';
  select conname from pg_constraint
   where conname in ('tasks_attachments_is_list', 'task_series_attachments_is_list');
  select pg_get_function_identity_arguments(oid) from pg_proc
   where proname in ('create_task_group', 'create_task_series');
  ```
  Two rows each (one per function, the last argument `p_attachments jsonb`).
- **Promoter notes**: Additive, writes no data, and needs no backfill (a constant default rewrites no row). Ship the API and the migration in one Deploy production run. The old functions are dropped, but the new ones take the same named arguments plus one with a default, so an API revision still running mid-deploy keeps working.

## Rollback

Rarely worth it: the columns are additive and default empty. If it must go, restore the previous function bodies from `20261119162318_task_tier_audience_and_followers.sql` (`create_task_group`) and `20261116044044_task_series.sql` (`create_task_series`, `insert_task_series_copy`) after dropping the new signatures, then drop the columns. An API revision that writes `p_attachments` must be rolled back first.

```sql
drop function if exists public.create_task_group(uuid, uuid, text, uuid[], text, text, date, timestamptz, int, text, text[], uuid, text, text, jsonb);
drop function if exists public.create_task_series(uuid, uuid, text, text, uuid, int, text, text[], time, text, date, timestamptz, timestamptz, date, jsonb);
-- Re-run the two earlier migrations' function definitions here, then:
alter table public.tasks drop constraint if exists tasks_attachments_is_list, drop column if exists attachments;
alter table public.task_series drop constraint if exists task_series_attachments_is_list, drop column if exists attachments;
```
