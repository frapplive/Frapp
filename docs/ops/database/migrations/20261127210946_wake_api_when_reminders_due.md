# 20261127210946_wake_api_when_reminders_due.sql

<!-- One page per migration: its promotion entry and its rollback recipe.
     check:migration-safety reads the two headings below. Shared procedure
     lives in ../promotion.md and ../../db-rollback-playbook.md; link to it,
     don't copy it. -->

The database wakes a sleeping API when a reminder or a scheduled message comes due (#6188, #6123 slice 2). It builds on [20261127184653](20261127184653_api_wake_chat_push_catch_up.md), which added `wake_api()`.

## Promotion

- **Purpose**:
  - `api_work_due(p_now)`: true when a sweep has something to send. That is one of:
    - a required, timed event starting within 35 minutes with no `EVENT_REMINDER` claim;
    - a timed task due within 65 minutes with no `DUE_SOON` claim, or due in the last 30 minutes with no `OVERDUE` claim;
    - an unfired chat reminder, a meeting-date reminder or a pending scheduled message due between 30 minutes ago and 5 minutes from now.

    Service role only.
  - `wake_api_if_due()`: calls `wake_api()` when `api_work_due(now())` is true. Errors become a warning.
  - The `pg_cron` extension (schema `pg_catalog`), only where the server has it, as hosted Supabase and the local stack do. It schedules two jobs: `wake-api-if-due` (`*/5 * * * *`), and `purge-cron-run-details` (daily at 04:17 UTC, keeping a week of `cron.job_run_details`).
  - The partial index `idx_tasks_due_at` on `tasks (due_at) where due_at is not null`.
- **Checks**:
  - `select jobname, schedule from cron.job;` lists `wake-api-if-due` and `purge-cron-run-details`.
  - After the next 5-minute mark, `select status, return_message from cron.job_run_details order by start_time desc limit 1;` is `succeeded`.
  - `select public.api_work_due(now());` returns without error, usually `f`.
  - On staging, put a timed task 20 minutes out, let the API sleep, and wait. Within 5 minutes `api_wake.poked_at` updates, and the "Due in" push arrives. With nothing due, `poked_at` stays put overnight.
- **Promoter notes**:
  - Needs 20261127184653 first, for `wake_api()` and `api_wake`. Without an API that writes `api_wake.url`, every wake is a no-op, so the order against the API doesn't matter.
  - If `pg_cron` was already enabled from the dashboard, `create extension if not exists` leaves it as it is. If the cron check above lists nothing, the server doesn't offer `pg_cron`: enable it under Database → Extensions and re-run the `do` block at the end of the migration.
  - It writes no rows apart from pg_cron's own. The index is built plainly, which blocks task writes for the moment it takes. Only tasks with a time of day are in it, so that's a short build.
  - The wake costs staging about 2 cents each (the instance's idle tail), a few a day. On production, at min 1, each one is a request it answers awake.

## Rollback

Revert if the job wakes staging far more than expected (`cron.job_run_details` beside `api_wake.poked_at`), or if a check errors. Unscheduling the job alone stops every wake and changes nothing else, so try that first. Decision matrix: [playbook](../../db-rollback-playbook.md#decision-matrix).

```sql
select cron.unschedule('wake-api-if-due');
select cron.unschedule('purge-cron-run-details');
drop function if exists public.wake_api_if_due();
drop function if exists public.api_work_due(timestamptz);
drop index if exists public.idx_tasks_due_at;
-- Leave pg_cron installed: dropping an extension other jobs may come to use
-- is its own decision.
```
