-- Action items of posted minutes made into tasks from the minutes (#6062).
--
-- Winston (2026-11-25): "i want to be able to assign people to tasks from
-- the minutes". Until now the only path from an action item to a task was
-- accepting its suggested task, which links them through the suggestion's
-- `dedupe_key` and `result_id`. An officer can now make the task right from
-- the item, so this table links such an item to its task.
--
-- The primary key is the guard against a second task for one item: two
-- officers assigning the same item at once both insert, and only one row
-- lands. A row is written as a claim (`task_id` null) before the task is
-- made, then filled in. The API takes over a claim left empty for minutes
-- (a crash between the two writes).
--
-- `item_key` is the item's fingerprint (`actionItemKey` in the API), the
-- same one a suggested task is keyed by, so an item tidied after posting
-- keeps its task.

create table if not exists public.meeting_action_item_tasks (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  item_key text not null check (char_length(item_key) = 32),
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  -- Null only while the task is being made. A deleted task frees its item.
  task_id uuid references public.tasks (id) on delete cascade,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (meeting_id, item_key)
);

create index if not exists meeting_action_item_tasks_chapter_idx
  on public.meeting_action_item_tasks (chapter_id);
create index if not exists meeting_action_item_tasks_task_idx
  on public.meeting_action_item_tasks (task_id) where task_id is not null;

-- Read and written by the API only, as the minutes' other side tables.
alter table public.meeting_action_item_tasks enable row level security;

comment on table public.meeting_action_item_tasks is
  'An action item of posted minutes that an officer made into a task from the minutes, by the item''s fingerprint (#6062). One task per item.';
