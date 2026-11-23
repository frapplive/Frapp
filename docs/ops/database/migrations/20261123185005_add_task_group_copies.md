# 20261123185005_add_task_group_copies.sql

<!-- One page per migration: its promotion entry and its rollback recipe.
     check:migration-safety reads the two headings below. Shared procedure
     lives in ../promotion.md and ../../db-rollback-playbook.md; link to it,
     don't copy it. -->

Adds `add_task_group_copies`, which gives new members a copy of an existing group task, at To do, made from one of its copies with that copy's checklist, skipping anyone who already has one (#5905; `spec/behavior/tasks.md` § Tasks for everyone, "Add members").

## Promotion

- **Purpose**: an officer can add people to a group task after it's made (`POST /v1/tasks/:id/group/add`). The function locks the group's row before it writes, so two adds racing for the same member make one copy. No table changes and no row is rewritten.
- **Checks**:
  - `select count(*) from pg_proc where proname = 'add_task_group_copies';` returns 1.
  - `select has_function_privilege('authenticated', 'public.add_task_group_copies(uuid, uuid, uuid, uuid[])', 'execute');` returns false.
  - `select has_function_privilege('service_role', 'public.add_task_group_copies(uuid, uuid, uuid, uuid[])', 'execute');` returns true.
- **Promoter notes**: promote before the API that calls it; until then `POST /v1/tasks/:id/group/add` answers a 500 and nothing else changes. It writes no data on its own.

## Rollback

Worth it only if the function itself misbehaves. Roll the API back first, then run this as a forward migration ([playbook](../../db-rollback-playbook.md#decision-matrix)). Copies it already made stay: each is an ordinary task in its group.

```sql
drop function if exists public.add_task_group_copies(uuid, uuid, uuid, uuid[]);
```
