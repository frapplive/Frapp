-- Wake a sleeping API when a reminder or a scheduled message comes due
-- (#6188, #6123 slice 2).
--
-- Slice 1 (20261127184653) wakes staging's API when a chat message arrives.
-- Nothing woke it for scheduled work: while the instance is stopped no sweep
-- runs, so a pre-event reminder due in that window was dropped for good, and
-- a chat reminder, a meeting-date reminder or a scheduled message waited for
-- the next time someone happened to wake it.
--
-- A wake on a plain schedule would cost nearly the $45 always-on Paul ruled
-- out: staging uses instance-based billing, so every wake pays for the
-- instance's ~15-minute idle tail. So the database checks every 5 minutes
-- whether a sweep has work, and wakes the API only then.
--
-- 1. `api_work_due(now)`: true when one of the sweeps below has something
--    due. Each check mirrors that sweep's own candidate query, and each is an
--    indexed `exists`, so the check costs a few index probes.
--    - Pre-event reminder (`ScheduledJobsService.sweepEventReminders`): a
--      required, timed event starting in (now, now + 30m], plus 5 minutes of
--      lead, with no EVENT_REMINDER claim.
--    - Timed task due soon (`sweepTimedTaskReminders`): due_at in
--      (now, now + 60m], plus the lead, with no DUE_SOON claim.
--    - Timed task overdue (the same sweep): due_at in the recent window with
--      no OVERDUE claim.
--    - Chat reminders (`ChatReminderSweepService`), meeting-date reminders
--      (`MeetingDateReminderSweepService`) and scheduled messages
--      (`ChatScheduledMessageSweepService`): a row due in the recent window.
--
--    Every check looks 5 minutes ahead, so the API is already up when the
--    item comes due, and only 30 minutes back, so a row that keeps failing
--    stops waking it after six checks instead of keeping it on for good.
-- 2. `wake_api_if_due()`: calls slice 1's `wake_api()` when work is due.
--    `wake_api()` already limits itself to once a minute and does nothing
--    until the API has written its address, as on local and CI databases.
-- 3. `pg_cron`, where the server has it, with the job `wake-api-if-due` every
--    5 minutes, and a daily purge of the job's run log.
-- 4. A partial index on `tasks (due_at)`, which the timed-task sweep and the
--    check both read.
--
-- Production runs at min 1, so there a wake is a request it answers awake.

-- 30 + 5 and 60 + 5 below: the event reminder's window
-- (EVENT_REMINDER_LEAD_MINUTES) and the timed task's due-soon lead
-- (TIMED_TASK_DUE_SOON_LEAD_MINUTES) in scheduled-jobs.service.ts, plus the
-- 5-minute lead. Keep them in step with those constants.
create or replace function public.api_work_due(p_now timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1
        from public.events e
       where e.start_time > p_now
         and e.start_time <= p_now + interval '35 minutes'
         and e.timing = 'timed'
         and e.calendar_only = false
         and (e.is_mandatory or e.required_role_ids is not null)
         and not exists (
           select 1
             from public.scheduled_notification_dispatches d
            where d.entity_type = 'EVENT'
              and d.entity_id = e.id
              and d.threshold = 'EVENT_REMINDER'
              and d.due_date = (e.start_time at time zone 'UTC')::date
         )
    )
    or exists (
      select 1
        from public.tasks t
       where t.due_at > p_now
         and t.due_at <= p_now + interval '65 minutes'
         and t.due_date is not null
         and t.status in ('TODO', 'IN_PROGRESS', 'OVERDUE')
         and not exists (
           select 1
             from public.scheduled_notification_dispatches d
            where d.entity_type = 'TASK'
              and d.entity_id = t.id
              and d.threshold = 'DUE_SOON'
              and d.due_date = t.due_date
         )
    )
    or exists (
      select 1
        from public.tasks t
       where t.due_at > p_now - interval '30 minutes'
         and t.due_at <= p_now + interval '5 minutes'
         and t.due_date is not null
         and t.status in ('TODO', 'IN_PROGRESS', 'OVERDUE')
         and not exists (
           select 1
             from public.scheduled_notification_dispatches d
            where d.entity_type = 'TASK'
              and d.entity_id = t.id
              and d.threshold = 'OVERDUE'
              and d.due_date = t.due_date
         )
    )
    or exists (
      select 1
        from public.chat_message_reminders r
       where r.fired_at is null
         and r.remind_at > p_now - interval '30 minutes'
         and r.remind_at <= p_now + interval '5 minutes'
    )
    or exists (
      select 1
        from public.meeting_date_reminders r
       where r.remind_at > p_now - interval '30 minutes'
         and r.remind_at <= p_now + interval '5 minutes'
    )
    or exists (
      select 1
        from public.chat_scheduled_messages s
       where s.status = 'pending'
         and s.send_at > p_now - interval '30 minutes'
         and s.send_at <= p_now + interval '5 minutes'
    );
$$;

create or replace function public.wake_api_if_due()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.api_work_due(now()) then
    perform public.wake_api();
  end if;
exception
  when others then
    -- Best effort, like wake_api() itself: a failed check costs one tick.
    raise warning 'wake_api_if_due: % (%)', sqlerrm, sqlstate;
end;
$$;

revoke execute on function public.api_work_due(timestamptz) from public;
revoke execute on function public.wake_api_if_due() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.api_work_due(timestamptz) from anon;
    revoke execute on function public.wake_api_if_due() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.api_work_due(timestamptz) from authenticated;
    revoke execute on function public.wake_api_if_due() from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.api_work_due(timestamptz) to service_role;
    grant execute on function public.wake_api_if_due() to service_role;
  end if;
end
$$;

-- The timed-task sweep's read (`findIncompleteTimedTasksDueBetween`) and the
-- task checks above filter on `due_at`, which had no index. Most tasks have
-- no time of day, so the index holds only the ones that do.
create index if not exists idx_tasks_due_at
  on public.tasks (due_at)
  where due_at is not null;

-- Only where the server ships pg_cron. Hosted Supabase and the local stack do
-- (schema pg_catalog, as Supabase's own docs and dashboard install it; its
-- objects live in `cron` either way). CI's migration replays (PGlite, and the
-- plain Postgres image the role-lock race check uses) don't, and there nothing
-- is scheduled. `cron.schedule` with a name replaces that job, so a replay
-- stays one job.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;

    perform cron.schedule(
      'wake-api-if-due',
      '*/5 * * * *',
      'select public.wake_api_if_due()'
    );

    -- pg_cron writes a row per run to cron.job_run_details and never trims
    -- it: 288 a day from the job above. Keep a week.
    perform cron.schedule(
      'purge-cron-run-details',
      '17 4 * * *',
      $cmd$delete from cron.job_run_details where end_time < now() - interval '7 days'$cmd$
    );
  end if;
end
$$;
