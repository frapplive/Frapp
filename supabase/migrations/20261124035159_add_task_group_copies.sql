-- Add people to a group task after it's made (#5905; spec/behavior/tasks.md
-- § Tasks for everyone, "Add members"). The mirror of taking members out
-- (#5492): each new member gets a copy, at To do, made from one of the
-- group's copies (the template the API picks) with its checklist titles.
--
-- The group's row is locked first, so two adds racing for the same member
-- make one copy, not two: the second waits, then finds the copy there and
-- skips it. A member who already has a copy is skipped, so a retry after a
-- partial failure finishes the job. Returns the copies made.

create or replace function public.add_task_group_copies(
  p_chapter_id uuid,
  p_group_id uuid,
  p_template_id uuid,
  p_assignee_ids uuid[]
)
returns setof public.tasks
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_template public.tasks%rowtype;
begin
  perform 1
     from public.task_groups
    where id = p_group_id
      and chapter_id = p_chapter_id
      for update;
  if not found then
    raise exception 'task group % not found', p_group_id;
  end if;

  select * into v_template
    from public.tasks
   where id = p_template_id
     and chapter_id = p_chapter_id
     and group_id = p_group_id;
  if not found then
    raise exception 'task % is not a copy of group %', p_template_id, p_group_id;
  end if;

  return query
  with added as (
    insert into public.tasks (
      chapter_id, title, description, assignee_id, created_by, due_date,
      due_at, status, point_reward, points_awarded, proof_kind, group_id,
      followed_by, meeting_id, attachments
    )
    select p_chapter_id, v_template.title, v_template.description,
           a.assignee_id, v_template.created_by, v_template.due_date,
           v_template.due_at, 'TODO', v_template.point_reward, false,
           v_template.proof_kind, p_group_id, v_template.followed_by,
           v_template.meeting_id, v_template.attachments
      from (select distinct unnest(coalesce(p_assignee_ids, '{}')) as assignee_id) a
     where not exists (
       select 1 from public.tasks c
        where c.chapter_id = p_chapter_id
          and c.group_id = p_group_id
          and c.assignee_id = a.assignee_id
     )
    returning *
  ), checklist as (
    insert into public.task_subtasks (task_id, chapter_id, title, position)
    select n.id, n.chapter_id, s.title, s.position
      from added n
     cross join public.task_subtasks s
     where s.task_id = p_template_id
  )
  select * from added order by created_at, id;
end;
$$;

revoke execute on function public.add_task_group_copies(uuid, uuid, uuid, uuid[]) from public;

do $$
declare
  v_fn text := 'public.add_task_group_copies(uuid, uuid, uuid, uuid[])';
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute format('revoke execute on function %s from anon', v_fn);
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute format('revoke execute on function %s from authenticated', v_fn);
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute format('grant execute on function %s to service_role', v_fn);
  end if;
end $$;
