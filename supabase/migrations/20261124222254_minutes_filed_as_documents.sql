-- Posted minutes are filed as documents (#5949, step 5 of #5943; Paul,
-- 2026-11-24: "File minutes as documents"). `spec/behavior/chapter-docs.md`
-- § Minutes and `spec/behavior/meetings.md` § Where minutes live.
--
-- A meeting's posted minutes get one row in `chapter_documents`, linked to
-- the meeting by `meeting_id`, so Documents lists them beside the chapter's
-- files and the Meetings list page can go. The minutes themselves stay in
-- `meetings`: the row holds no file and no text, only where it is filed.
--
-- Who sees a minutes row is the meeting's own rule (the event's invite rule,
-- read by the API each time), never a copy of it stored here, so a changed
-- audience can't leave a stale list behind. Both tables stay API-only (RLS
-- on, no client policies), as before.

-- ─── A document row is a file or a meeting's minutes ───────────────────────

alter table public.chapter_documents
  add column if not exists meeting_id uuid;

-- A minutes row has no file and no uploader.
alter table public.chapter_documents
  alter column storage_path drop not null;
alter table public.chapter_documents
  alter column uploaded_by drop not null;

-- The link carries the chapter, so a row can never name another chapter's
-- minutes. The target needs its own unique key for that.
create unique index if not exists meetings_id_chapter_key
  on public.meetings (id, chapter_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'chapter_documents_meeting_fkey'
       and conrelid = 'public.chapter_documents'::regclass
  ) then
    alter table public.chapter_documents
      add constraint chapter_documents_meeting_fkey
      foreign key (meeting_id, chapter_id)
      references public.meetings (id, chapter_id)
      on delete cascade
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'chapter_documents_file_or_minutes'
       and conrelid = 'public.chapter_documents'::regclass
  ) then
    -- Exactly one of the two: a file with its uploader, or a meeting. A
    -- minutes row is never a Drive copy either.
    alter table public.chapter_documents
      add constraint chapter_documents_file_or_minutes check (
        (meeting_id is null
          and storage_path is not null
          and uploaded_by is not null)
        or
        (meeting_id is not null
          and storage_path is null
          and uploaded_by is null
          and drive_file_id is null)
      ) not valid;
  end if;
end
$$;

alter table public.chapter_documents
  validate constraint chapter_documents_meeting_fkey;
alter table public.chapter_documents
  validate constraint chapter_documents_file_or_minutes;

-- One row per meeting.
create unique index if not exists chapter_documents_meeting_id_key
  on public.chapter_documents (meeting_id)
  where meeting_id is not null;

comment on column public.chapter_documents.meeting_id is
  'The meeting whose posted minutes this row files (#5949), or null for a file. A minutes row has no storage_path and no uploaded_by, and is read only by members the meeting''s own rule lets read the minutes.';

-- ─── Folders the minutes flow makes ────────────────────────────────────────

alter table public.chapter_document_folders
  add column if not exists minutes_series_key text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'chapter_document_folders_minutes_series_key_len'
       and conrelid = 'public.chapter_document_folders'::regclass
  ) then
    alter table public.chapter_document_folders
      add constraint chapter_document_folders_minutes_series_key_len
      check (
        minutes_series_key is null
        or char_length(minutes_series_key) between 1 and 64
      );
  end if;
end
$$;

create unique index if not exists chapter_document_folders_minutes_series_key
  on public.chapter_document_folders (chapter_id, minutes_series_key)
  where minutes_series_key is not null;

comment on column public.chapter_document_folders.minutes_series_key is
  'Set on a folder the minutes flow files into (#5949): ''root'' for the chapter''s Minutes folder, or a repeating meeting''s series (its first event''s id) for that series'' folder. Filing finds the folder by this key, so an officer''s rename sticks. A series folder shows only to a member who can see something in it.';

-- ─── Minutes rows are not a second copy in the assistant's index ──────────
--
-- Posted minutes are already indexed as `meeting_minutes`, read under the
-- meeting's own rule. Their Documents row holds no text, so it is never a
-- `chapter_document` source.

create or replace function public.corpus_follow_chapter_document()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.drop_corpus_source(old.chapter_id, 'chapter_document', old.id);
    return old;
  end if;
  if new.meeting_id is not null then
    return new;
  end if;
  if tg_op = 'INSERT'
     or new.title is distinct from old.title
     or new.storage_path is distinct from old.storage_path
     or new.content_type is distinct from old.content_type
     or new.document_type is distinct from old.document_type
     or new.effective_date is distinct from old.effective_date
  then
    perform public.note_corpus_source(
      new.chapter_id, 'chapter_document', new.id, new.uploaded_by);
  end if;
  return new;
end;
$$;

-- ─── Filing ────────────────────────────────────────────────────────────────

-- A folder name the chapter doesn't use yet: `p_base`, else "p_base (2)",
-- "p_base (3)"…, each cut to the 100 characters a folder name holds.
create or replace function public.free_document_folder_name(
  p_chapter_id uuid,
  p_base text
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_base text := btrim(left(btrim(p_base), 100));
  v_name text := v_base;
  v_suffix text;
  v_n integer := 1;
begin
  while exists (
    select 1 from public.chapter_document_folders
     where chapter_id = p_chapter_id and name = v_name
  ) loop
    v_n := v_n + 1;
    v_suffix := ' (' || v_n || ')';
    v_name := btrim(left(v_base, 100 - char_length(v_suffix))) || v_suffix;
  end loop;
  return v_name;
end;
$$;

-- Files a meeting's posted minutes as a document, or follows its name when
-- it is filed already. Returns the document's id, or null when the minutes
-- are not this chapter's or not posted. Safe to call again: the API calls it
-- when minutes post and on each later save, and `file_unfiled_minutes` calls
-- it for minutes posted before this migration.
--
-- Where it files, on first filing only (a row an officer moved stays moved):
--   - the chapter's Minutes folder (key 'root'): an open folder named
--     "Minutes" or "Meeting Minutes" the chapter already keeps is taken as
--     it, else "Minutes" is made;
--   - under it, for a repeating meeting, the folder for its series, named
--     "<Minutes> / <the series' name>" and keyed by the series' first event,
--     the rule `eventSeriesKey` in `@repo/validation` keys a series by. A new
--     series folder starts with the Minutes folder's who-can-see, so it is
--     never wider than the folder it sits under.
create or replace function public.file_minutes_document(
  p_chapter_id uuid,
  p_meeting_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_meeting public.meetings;
  v_document_id uuid;
  v_root public.chapter_document_folders;
  v_series uuid;
  v_series_name text;
  v_folder text;
  v_type text;
begin
  select * into v_meeting
    from public.meetings
   where id = p_meeting_id and chapter_id = p_chapter_id;
  if not found or v_meeting.status <> 'posted' then
    return null;
  end if;

  update public.chapter_documents
     set title = v_meeting.event_name
   where meeting_id = p_meeting_id
     and chapter_id = p_chapter_id
     and title is distinct from v_meeting.event_name;
  select id into v_document_id
    from public.chapter_documents
   where meeting_id = p_meeting_id and chapter_id = p_chapter_id;
  if found then
    return v_document_id;
  end if;

  -- One filing at a time per chapter, so two posts never both make the
  -- Minutes folder or the same series folder.
  perform pg_advisory_xact_lock(
    hashtextextended('minutes-folders:' || p_chapter_id::text, 0));

  select * into v_root
    from public.chapter_document_folders
   where chapter_id = p_chapter_id and minutes_series_key = 'root';
  if not found then
    select * into v_root
      from public.chapter_document_folders
     where chapter_id = p_chapter_id
       and minutes_series_key is null
       and who_can_see is null
       and drive_folder_id is null
       and lower(btrim(name)) in ('minutes', 'meeting minutes')
     order by (lower(btrim(name)) = 'minutes') desc, sort_order, name
     limit 1;
    if found then
      update public.chapter_document_folders
         set minutes_series_key = 'root'
       where id = v_root.id
      returning * into v_root;
    else
      insert into public.chapter_document_folders
        (chapter_id, name, sort_order, minutes_series_key)
      values (
        p_chapter_id,
        public.free_document_folder_name(p_chapter_id, 'Minutes'),
        coalesce((select max(sort_order) + 1
                    from public.chapter_document_folders
                   where chapter_id = p_chapter_id), 0),
        'root')
      returning * into v_root;
    end if;
  end if;

  if v_meeting.event_id is not null then
    select coalesce(
             e.parent_event_id,
             case when nullif(btrim(e.recurrence_rule), '') is not null
                  then e.id end)
      into v_series
      from public.events e
     where e.id = v_meeting.event_id and e.chapter_id = p_chapter_id;
  end if;

  if v_series is null then
    v_folder := v_root.name;
  else
    select name into v_folder
      from public.chapter_document_folders
     where chapter_id = p_chapter_id
       and minutes_series_key = v_series::text;
    if not found then
      select nullif(btrim(e.name), '') into v_series_name
        from public.events e
       where e.id = v_series and e.chapter_id = p_chapter_id;
      v_folder := public.free_document_folder_name(
        p_chapter_id,
        v_root.name || ' / ' || coalesce(v_series_name, v_meeting.event_name));
      insert into public.chapter_document_folders
        (chapter_id, name, sort_order, minutes_series_key, who_can_see)
      values (
        p_chapter_id,
        v_folder,
        coalesce((select max(sort_order) + 1
                    from public.chapter_document_folders
                   where chapter_id = p_chapter_id), 0),
        v_series::text,
        v_root.who_can_see);
    end if;
  end if;

  -- The chapter's own spelling of the Minutes type; added when the chapter
  -- has none and its list has room (50, `DOCUMENT_TYPES_MAX`).
  select name into v_type
    from public.chapter_document_types
   where chapter_id = p_chapter_id
     and public.document_type_key(name) = 'minutes'
   limit 1;
  if not found then
    v_type := 'Minutes';
    if (select count(*) from public.chapter_document_types
         where chapter_id = p_chapter_id) < 50 then
      insert into public.chapter_document_types (chapter_id, name, sort_order)
      values (
        p_chapter_id,
        v_type,
        coalesce((select max(sort_order) + 1
                    from public.chapter_document_types
                   where chapter_id = p_chapter_id), 0));
    end if;
  end if;

  insert into public.chapter_documents
    (chapter_id, title, folder, document_type, meeting_id, created_at)
  values (
    p_chapter_id,
    v_meeting.event_name,
    v_folder,
    v_type,
    p_meeting_id,
    coalesce(v_meeting.posted_at, now()))
  returning id into v_document_id;
  return v_document_id;
end;
$$;

-- When the last minutes leave a series folder (the minutes were deleted),
-- the folder goes too, unless it holds anything else. The chapter's Minutes
-- folder stays.
create or replace function public.drop_empty_minutes_series_folder()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.meeting_id is not null and old.folder is not null then
    delete from public.chapter_document_folders f
     where f.chapter_id = old.chapter_id
       and f.name = old.folder
       and f.minutes_series_key is not null
       and f.minutes_series_key <> 'root'
       and not exists (
         select 1 from public.chapter_documents d
          where d.chapter_id = old.chapter_id and d.folder = old.folder
       );
  end if;
  return old;
end;
$$;

drop trigger if exists trg_chapter_documents_minutes_folder
  on public.chapter_documents;
create trigger trg_chapter_documents_minutes_folder
  after delete on public.chapter_documents
  for each row execute function public.drop_empty_minutes_series_folder();

-- ─── Minutes posted before this, and any a save missed ─────────────────────
--
-- Files up to p_limit posted minutes that have no row yet, oldest meeting
-- first, and returns how many it filed. The API runs it when it starts and
-- every few minutes after (`MinutesDocumentSweepService`), which is also the
-- backfill: nothing is filed by this migration itself, because the API
-- before #5949 would list a filed row to every member who can open
-- Documents, and production migrates before it ships the API.
create or replace function public.file_unfiled_minutes(p_limit integer)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_filed integer := 0;
begin
  for v_row in
    select m.chapter_id, m.id
      from public.meetings m
     where m.status = 'posted'
       and not exists (
         select 1 from public.chapter_documents d where d.meeting_id = m.id
       )
     order by m.event_start_time, m.id
     limit greatest(coalesce(p_limit, 0), 0)
  loop
    if public.file_minutes_document(v_row.chapter_id, v_row.id) is not null then
      v_filed := v_filed + 1;
    end if;
  end loop;
  return v_filed;
end;
$$;

-- API-only, like the tables: the service role calls them.
do $$
declare
  v_fn text;
  v_role text;
begin
  foreach v_fn in array array[
    'public.free_document_folder_name(uuid, text)',
    'public.file_minutes_document(uuid, uuid)',
    'public.file_unfiled_minutes(integer)',
    'public.drop_empty_minutes_series_folder()'
  ] loop
    execute format('revoke execute on function %s from public', v_fn);
    foreach v_role in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then
        execute format('revoke execute on function %s from %I', v_fn, v_role);
      end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', v_fn);
    end if;
  end loop;
end
$$;
