-- School layer 3: affiliations and PNM records (#5974, plan on #5833).
-- `spec/architecture/school-layer.md` § 2.4, § 2.5, § 3.5, § 4.1;
-- `spec/behavior/ifc-recruitment.md` § The council master list and
-- § Retention and deletion.
--
-- 1. `school_chapters` gains § 2.4's `declined` and `ended` states and
--    `ended_at`. A chapter officer confirms, declines or ends the link
--    (`set_school_chapter_status`); nothing writes `active` directly.
-- 2. `council_chapters`: a chapter's link to its school's council. Either
--    side proposes, the other accepts or declines; only the council suspends;
--    either side ends (`set_council_chapter_status`). The two must share the
--    school: the chapter's `active` school link names the council's school
--    (`chapters.council_school_id`, #5933). Ending the chapter's school link
--    ends its council links there.
-- 3. PNMs: `pnms` (one per person per school, keyed on the verified school
--    email), `council_recruitment_seasons`, `pnm_council_registrations`,
--    `pnm_interests`, the merge log `pnm_merges` and the merge queue's
--    "not the same person" answers, `pnm_duplicate_dismissals`.
-- 4. `rush_candidates.pnm_id` and `origin` (§ 2.5, D6), additive: the
--    recruitment pipeline (#5972) adds its own columns beside them.
-- 5. `council_pnm_access_log`: every council read of a PNM record, phone
--    numbers above all (Paul, 2026-11-11, #4218 decision 9). Append-only by
--    trigger, which binds the service role too (§ 3.4).
-- 6. Functions, each security definer, service role only, `search_path`
--    pinned: `upsert_verified_pnm`, `record_pnm_interest`, `merge_pnms`,
--    `delete_pnm`, `purge_expired_pnms`, and account deletion (the
--    `users_drop_school_rows` trigger) deleting the person's PNM records.
--
-- Not here, and why: the public interest form (`/f/<form-slug>`), the
-- master-list screens, push-up events (`pnm_recruitment_events`), the
-- chapter candidate a form creates, eligibility and its tables. They're the
-- next slices (#5974 § Not in this slice). `merge_pnms` refuses a record,
-- verdict or release once those tables exist; today there are none to have.
--
-- Posture: RLS on with no policies on every new table, as every chapter
-- table (`00000000000000_initial_schema.sql`); the API reaches them through
-- the service role (§ 4.1).
--
-- Locks. `school_chapters` and `rush_candidates` are small; the new column
-- on `rush_candidates` has a constant default, which rewrites nothing, and
-- its index builds hold a SHARE lock for milliseconds. The status check on
-- `school_chapters` is added `not valid` and then validated.

-- 1. school_chapters: the full state set -----------------------------------------

alter table public.school_chapters
  add column if not exists ended_at timestamptz;

alter table public.school_chapters
  drop constraint if exists school_chapters_status_check;
alter table public.school_chapters
  add constraint school_chapters_status_check
  check (status in ('proposed', 'active', 'declined', 'ended')) not valid;
alter table public.school_chapters
  validate constraint school_chapters_status_check;

comment on table public.school_chapters is
  'A chapter''s school affiliation (school-layer.md § 2.4): proposed, active, declined or ended. An officer of the chapter confirms (set_school_chapter_status); nothing writes active directly.';

-- 2. council_chapters ----------------------------------------------------------------

create table if not exists public.council_chapters (
  id               uuid primary key default gen_random_uuid(),
  council_id       uuid not null references public.chapters(id) on delete cascade,
  chapter_id       uuid not null references public.chapters(id) on delete cascade,
  status           text not null default 'proposed'
                   constraint council_chapters_status_check
                   check (status in ('proposed', 'accepted', 'declined', 'suspended', 'ended')),
  proposed_by_side text not null
                   constraint council_chapters_side_check
                   check (proposed_by_side in ('council', 'chapter')),
  proposed_by      uuid references public.users(id) on delete set null,
  decided_by       uuid references public.users(id) on delete set null,
  decided_at       timestamptz,
  created_at       timestamptz not null default now(),
  constraint council_chapters_distinct check (council_id <> chapter_id)
);

create unique index if not exists council_chapters_live_pair
  on public.council_chapters (council_id, chapter_id)
  where status in ('proposed', 'accepted', 'suspended');
create index if not exists idx_council_chapters_chapter_id
  on public.council_chapters (chapter_id);
create index if not exists idx_council_chapters_proposed_by
  on public.council_chapters (proposed_by);
create index if not exists idx_council_chapters_decided_by
  on public.council_chapters (decided_by);

alter table public.council_chapters enable row level security;

comment on table public.council_chapters is
  'A chapter''s membership in a council (school-layer.md § 2.4): both sides agree. Written only by set_council_chapter_status; a council sees nothing of a chapter until accepted, and never reads it live (#4068 decision 11).';

-- 3. PNMs ----------------------------------------------------------------------------

create table if not exists public.pnms (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  user_id           uuid references public.users(id) on delete set null,
  school_email      text not null,
  email_verified_at timestamptz,
  first_name        text not null,
  last_name         text not null,
  preferred_name    text,
  class_year        smallint,
  phone             text,
  phone_shared      boolean not null default false,
  merged_into_id    uuid references public.pnms(id) on delete cascade,
  created_via       text not null
                    constraint pnms_created_via_check
                    check (created_via in ('interest_form', 'council_registration', 'council_import')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint pnms_school_email_lower check (school_email = lower(btrim(school_email))),
  constraint pnms_names_len check (
    char_length(btrim(first_name)) between 1 and 100
    and char_length(btrim(last_name)) between 1 and 100
    and (preferred_name is null or char_length(btrim(preferred_name)) between 1 and 100)
  ),
  constraint pnms_class_year_range check (class_year is null or class_year between 1900 and 2200),
  constraint pnms_phone_len check (phone is null or char_length(phone) between 7 and 32),
  constraint pnms_not_self_merged check (merged_into_id is null or merged_into_id <> id)
);

create unique index if not exists pnms_school_email_key
  on public.pnms (school_id, school_email) where merged_into_id is null;
create index if not exists idx_pnms_user_id
  on public.pnms (user_id) where user_id is not null;
create index if not exists idx_pnms_merged_into_id
  on public.pnms (merged_into_id) where merged_into_id is not null;
-- The merge queue's "same name" pairs, per school.
create index if not exists idx_pnms_school_name
  on public.pnms (school_id, lower(btrim(last_name)), lower(btrim(first_name)))
  where merged_into_id is null;

alter table public.pnms enable row level security;

comment on table public.pnms is
  'One potential new member per person per school (school-layer.md § 2.5, D5), keyed on a verified school email. Holds only what every party may see; a chapter''s pipeline never writes here. A merged duplicate points at its survivor and goes with it.';
comment on column public.pnms.phone is
  'Shown to a chapter only when phone_shared and linked; to a council only with council:recruitment_manage, every view logged in council_pnm_access_log (Paul, 2026-11-11).';

create table if not exists public.council_recruitment_seasons (
  council_id           uuid not null references public.chapters(id) on delete cascade,
  term                 text not null,
  opens_at             timestamptz not null,
  closes_at            timestamptz not null,
  bid_window_opens_at  timestamptz,
  bid_window_closes_at timestamptz,
  status               text not null default 'planned'
                       constraint council_recruitment_seasons_status_check
                       check (status in ('planned', 'open', 'closed')),
  pnm_retention_days   smallint not null default 180
                       constraint council_recruitment_seasons_retention_check
                       check (pnm_retention_days between 0 and 180),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (council_id, term),
  constraint council_recruitment_seasons_term_len check (char_length(btrim(term)) between 1 and 40),
  constraint council_recruitment_seasons_dates check (closes_at > opens_at),
  constraint council_recruitment_seasons_bid_window check (
    bid_window_opens_at is null or bid_window_closes_at is null
    or bid_window_closes_at > bid_window_opens_at
  )
);

alter table public.council_recruitment_seasons enable row level security;

comment on table public.council_recruitment_seasons is
  'A council''s recruitment season (ifc-recruitment.md § Words used here). While status is open the council sees interests as counts only (Winston, 2026-11-11). pnm_retention_days is N in "season close plus N days" for PNM records, at most 180 (Paul, #4218).';

create table if not exists public.pnm_council_registrations (
  id         uuid primary key default gen_random_uuid(),
  pnm_id     uuid not null references public.pnms(id) on delete cascade,
  council_id uuid not null references public.chapters(id) on delete cascade,
  term       text not null,
  status     text not null default 'registered'
             constraint pnm_council_registrations_status_check
             check (status in ('registered', 'withdrawn', 'released')),
  created_at timestamptz not null default now(),
  unique (pnm_id, council_id, term),
  foreign key (council_id, term)
    references public.council_recruitment_seasons (council_id, term) on delete cascade
);

create index if not exists idx_pnm_council_registrations_council_term
  on public.pnm_council_registrations (council_id, term);

alter table public.pnm_council_registrations enable row level security;

comment on table public.pnm_council_registrations is
  'A PNM on a council''s master list for a season (school-layer.md § 2.5). The master list is these rows, for PNMs at the council''s own school.';

create table if not exists public.pnm_interests (
  id              uuid primary key default gen_random_uuid(),
  pnm_id          uuid not null references public.pnms(id) on delete cascade,
  chapter_id      uuid not null references public.chapters(id) on delete cascade,
  registration_id uuid references public.pnm_council_registrations(id) on delete set null,
  source          text not null
                  constraint pnm_interests_source_check
                  check (source in ('interest_form', 'council_registration', 'council_import')),
  source_label    text
                  constraint pnm_interests_source_label_len
                  check (source_label is null or char_length(source_label) between 1 and 60),
  created_at      timestamptz not null default now(),
  withdrawn_at    timestamptz,
  unique (pnm_id, chapter_id)
);

create index if not exists idx_pnm_interests_chapter_id
  on public.pnm_interests (chapter_id);
create index if not exists idx_pnm_interests_registration_id
  on public.pnm_interests (registration_id) where registration_id is not null;

alter table public.pnm_interests enable row level security;

comment on table public.pnm_interests is
  'A PNM''s interest in one chapter (school-layer.md § 2.5, D7). Written only by the PNM''s own action or their council registration (record_pnm_interest); a chapter never writes one.';

create table if not exists public.pnm_merges (
  id               bigint generated always as identity primary key,
  council_id       uuid not null references public.chapters(id) on delete cascade,
  survivor_id      uuid not null references public.pnms(id) on delete cascade,
  loser_id         uuid not null,
  actor_user_id    uuid references public.users(id) on delete set null,
  survivor_before  jsonb not null,
  loser_before     jsonb not null,
  at               timestamptz not null default now()
);

create index if not exists idx_pnm_merges_council_id
  on public.pnm_merges (council_id, at desc);
create index if not exists idx_pnm_merges_survivor_id
  on public.pnm_merges (survivor_id);
create index if not exists idx_pnm_merges_actor_user_id
  on public.pnm_merges (actor_user_id) where actor_user_id is not null;

alter table public.pnm_merges enable row level security;

comment on table public.pnm_merges is
  'Every PNM merge: who made it and what each side held (ifc-recruitment.md § Identity and duplicates). Holds PII, so it goes with the survivor (on delete cascade). The MVP has no unmerge.';

create table if not exists public.pnm_duplicate_dismissals (
  council_id   uuid not null references public.chapters(id) on delete cascade,
  pnm_a        uuid not null references public.pnms(id) on delete cascade,
  pnm_b        uuid not null references public.pnms(id) on delete cascade,
  dismissed_by uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (council_id, pnm_a, pnm_b),
  constraint pnm_duplicate_dismissals_ordered check (pnm_a < pnm_b)
);

create index if not exists idx_pnm_duplicate_dismissals_pnm_b
  on public.pnm_duplicate_dismissals (pnm_b);
create index if not exists idx_pnm_duplicate_dismissals_pnm_a
  on public.pnm_duplicate_dismissals (pnm_a);
create index if not exists idx_pnm_duplicate_dismissals_dismissed_by
  on public.pnm_duplicate_dismissals (dismissed_by) where dismissed_by is not null;

alter table public.pnm_duplicate_dismissals enable row level security;

comment on table public.pnm_duplicate_dismissals is
  'A council officer''s "not the same person" answer to a merge-queue suggestion, so the pair stops being suggested.';

-- 4. rush_candidates.pnm_id ------------------------------------------------------------

alter table public.rush_candidates
  add column if not exists pnm_id uuid references public.pnms(id) on delete set null,
  add column if not exists origin text not null default 'manual';

alter table public.rush_candidates
  drop constraint if exists rush_candidates_origin_check;
alter table public.rush_candidates
  add constraint rush_candidates_origin_check
  check (origin in ('manual', 'pnm')) not valid;
alter table public.rush_candidates
  validate constraint rush_candidates_origin_check;

create unique index if not exists rush_candidates_chapter_pnm_key
  on public.rush_candidates (chapter_id, pnm_id) where pnm_id is not null;
create index if not exists idx_rush_candidates_pnm_id
  on public.rush_candidates (pnm_id) where pnm_id is not null;

comment on column public.rush_candidates.pnm_id is
  'The school-level PNM this chapter prospect is (school-layer.md § 2.5). Null for a hand-added prospect: typing a known school email never links one (D7).';
comment on column public.rush_candidates.origin is
  'manual (a member added them) or pnm (from the PNM''s own interest). Never changes, so a deleted PNM can''t turn a row back into a hand-added one.';

-- 5. council_pnm_access_log -----------------------------------------------------------

create table if not exists public.council_pnm_access_log (
  id            bigint generated always as identity primary key,
  council_id    uuid not null,
  actor_user_id uuid,
  pnm_id        uuid,
  fields        text[] not null,
  at            timestamptz not null default now()
);

create index if not exists idx_council_pnm_access_log_council_at
  on public.council_pnm_access_log (council_id, at desc);

alter table public.council_pnm_access_log enable row level security;

comment on table public.council_pnm_access_log is
  'Every council read of a PNM record (school-layer.md § 3.3). No foreign keys, so a row outlives what it describes; append-only by trigger.';

create or replace function public.refuse_council_pnm_access_log_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'council_pnm_access_log is append-only';
end;
$$;

revoke all on function public.refuse_council_pnm_access_log_change()
  from public, anon, authenticated;

drop trigger if exists council_pnm_access_log_append_only on public.council_pnm_access_log;
create trigger council_pnm_access_log_append_only
  before update or delete on public.council_pnm_access_log
  for each row execute function public.refuse_council_pnm_access_log_change();

-- 6. Functions --------------------------------------------------------------------------

-- One lock per chapter for every affiliation change, so a council link and
-- the school link it depends on can't change under each other.
create or replace function public.lock_chapter_affiliations(p_chapter_id uuid)
returns void
language sql
set search_path = public, pg_temp
as $$
  select pg_advisory_xact_lock(hashtextextended('affiliations:' || p_chapter_id::text, 0));
$$;

revoke all on function public.lock_chapter_affiliations(uuid)
  from public, anon, authenticated;

-- A chapter officer confirms, declines or ends their chapter's school link
-- (§ 2.4). Confirming a second school while one is primary makes the new
-- one secondary. Ending a link ends the chapter's council links at that
-- school, since a council link needs the shared school.
create or replace function public.set_school_chapter_status(
  p_link_id    uuid,
  p_chapter_id uuid,
  p_status     text,
  p_actor      uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link public.school_chapters;
  v_has_primary boolean;
begin
  perform public.lock_chapter_affiliations(p_chapter_id);

  select * into v_link
    from public.school_chapters
   where id = p_link_id and chapter_id = p_chapter_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if p_status = 'active' then
    if v_link.status <> 'proposed' then
      return jsonb_build_object('ok', false, 'reason', 'invalid_transition');
    end if;
    select exists (
      select 1 from public.school_chapters
       where chapter_id = p_chapter_id and status = 'active' and is_primary
    ) into v_has_primary;
    update public.school_chapters
       set status = 'active',
           is_primary = not v_has_primary,
           confirmed_by = p_actor,
           confirmed_at = now()
     where id = v_link.id
     returning * into v_link;
  elsif p_status = 'declined' then
    if v_link.status <> 'proposed' then
      return jsonb_build_object('ok', false, 'reason', 'invalid_transition');
    end if;
    update public.school_chapters
       set status = 'declined', confirmed_by = p_actor, ended_at = now()
     where id = v_link.id
     returning * into v_link;
  elsif p_status = 'ended' then
    if v_link.status <> 'active' then
      return jsonb_build_object('ok', false, 'reason', 'invalid_transition');
    end if;
    update public.school_chapters
       set status = 'ended', ended_at = now()
     where id = v_link.id
     returning * into v_link;
    update public.council_chapters cc
       set status = 'ended', decided_by = p_actor, decided_at = now()
      from public.chapters c
     where cc.chapter_id = p_chapter_id
       and cc.council_id = c.id
       and c.council_school_id = v_link.school_id
       and cc.status in ('proposed', 'accepted', 'suspended');
  else
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition');
  end if;

  return jsonb_build_object('ok', true, 'link', to_jsonb(v_link));
end;
$$;

revoke all on function public.set_school_chapter_status(uuid, uuid, text, uuid)
  from public, anon, authenticated;

-- Every council_chapters change (§ 2.4). The API has already checked the
-- caller's key on their side (`council:chapters_manage` or
-- `chapter-config:manage`); this checks the pair and the transition:
--   proposed  — no live link; either side; needs the shared school
--   accepted  — the other side accepts a proposal (needs the shared school),
--               or the council lifts a suspension
--   declined  — the other side declines a proposal
--   suspended — the council, on an accepted link
--   ended     — either side, on a live link (a proposer withdrawing too)
create or replace function public.set_council_chapter_status(
  p_council_id uuid,
  p_chapter_id uuid,
  p_side       text,
  p_status     text,
  p_actor      uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_council public.chapters;
  v_chapter public.chapters;
  v_link public.council_chapters;
  v_shared boolean;
begin
  if p_side not in ('council', 'chapter') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition');
  end if;

  perform public.lock_chapter_affiliations(p_chapter_id);

  select * into v_council from public.chapters where id = p_council_id;
  select * into v_chapter from public.chapters where id = p_chapter_id;
  if v_council.id is null or v_chapter.id is null
     or v_council.kind <> 'council' or v_chapter.kind <> 'chapter' then
    return jsonb_build_object('ok', false, 'reason', 'wrong_kind');
  end if;

  select exists (
    select 1 from public.school_chapters sc
     where sc.chapter_id = p_chapter_id
       and sc.status = 'active'
       and sc.school_id = v_council.council_school_id
  ) into v_shared;

  select * into v_link
    from public.council_chapters
   where council_id = p_council_id
     and chapter_id = p_chapter_id
     and status in ('proposed', 'accepted', 'suspended')
   for update;

  if p_status = 'proposed' then
    if v_link.id is not null then
      return jsonb_build_object('ok', false, 'reason', 'exists', 'link', to_jsonb(v_link));
    end if;
    if not v_shared then
      return jsonb_build_object('ok', false, 'reason', 'no_shared_school');
    end if;
    insert into public.council_chapters (council_id, chapter_id, status, proposed_by_side, proposed_by)
    values (p_council_id, p_chapter_id, 'proposed', p_side, p_actor)
    returning * into v_link;
    return jsonb_build_object('ok', true, 'link', to_jsonb(v_link));
  end if;

  if v_link.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if p_status = 'accepted' then
    if v_link.status = 'proposed' and v_link.proposed_by_side <> p_side then
      if not v_shared then
        return jsonb_build_object('ok', false, 'reason', 'no_shared_school');
      end if;
    elsif not (v_link.status = 'suspended' and p_side = 'council') then
      return jsonb_build_object('ok', false, 'reason', 'invalid_transition');
    end if;
  elsif p_status = 'declined' then
    if not (v_link.status = 'proposed' and v_link.proposed_by_side <> p_side) then
      return jsonb_build_object('ok', false, 'reason', 'invalid_transition');
    end if;
  elsif p_status = 'suspended' then
    if not (v_link.status = 'accepted' and p_side = 'council') then
      return jsonb_build_object('ok', false, 'reason', 'invalid_transition');
    end if;
  elsif p_status <> 'ended' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition');
  end if;

  update public.council_chapters
     set status = p_status, decided_by = p_actor, decided_at = now()
   where id = v_link.id
   returning * into v_link;
  return jsonb_build_object('ok', true, 'link', to_jsonb(v_link));
end;
$$;

revoke all on function public.set_council_chapter_status(uuid, uuid, text, text, uuid)
  from public, anon, authenticated;

-- The live PNM a row has become: itself, or the survivor it was merged into.
create or replace function public.pnm_survivor(p_pnm_id uuid)
returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_id uuid := p_pnm_id;
  v_next uuid;
  v_hops int := 0;
begin
  loop
    select merged_into_id into v_next from public.pnms where id = v_id;
    if not found then
      return null;
    end if;
    exit when v_next is null;
    v_id := v_next;
    v_hops := v_hops + 1;
    if v_hops > 16 then
      return null;
    end if;
  end loop;
  return v_id;
end;
$$;

revoke all on function public.pnm_survivor(uuid)
  from public, anon, authenticated;

-- Finds or creates the PNM for a verified school email (§ Identity and
-- duplicates). The caller has proved the address with a one-time code, so
-- the submission is the person's own and refreshes their details. The
-- address must be on one of the school's verified domains; matching
-- lowercases it and keeps `+tags` and dots, since not every school's mail
-- ignores them.
create or replace function public.upsert_verified_pnm(
  p_school_id      uuid,
  p_email          text,
  p_first_name     text,
  p_last_name      text,
  p_preferred_name text,
  p_class_year     smallint,
  p_phone          text,
  p_phone_shared   boolean,
  p_created_via    text,
  p_user_id        uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(p_email));
  v_row public.pnms;
  v_created boolean := false;
begin
  if not exists (select 1 from public.schools where id = p_school_id and status <> 'suspended') then
    return jsonb_build_object('ok', false, 'reason', 'school_not_found');
  end if;
  if position('@' in v_email) = 0
     or not public.school_accepts_email_domain(p_school_id, public.school_email_domain(v_email)) then
    return jsonb_build_object('ok', false, 'reason', 'wrong_domain');
  end if;

  -- Two first submissions of one address at once: the unique index holds,
  -- and the loser takes the winner's row.
  loop
    select * into v_row
      from public.pnms
     where school_id = p_school_id and school_email = v_email and merged_into_id is null
     for update;
    exit when found;
    begin
      insert into public.pnms (
        school_id, user_id, school_email, email_verified_at, first_name, last_name,
        preferred_name, class_year, phone, phone_shared, created_via
      ) values (
        p_school_id, p_user_id, v_email, now(), btrim(p_first_name), btrim(p_last_name),
        nullif(btrim(p_preferred_name), ''), p_class_year, nullif(btrim(p_phone), ''),
        coalesce(p_phone_shared, false), p_created_via
      )
      returning * into v_row;
      v_created := true;
      exit;
    exception when unique_violation then
      -- loop and read the row the other submission wrote
    end;
  end loop;

  if not v_created then
    update public.pnms
       set first_name        = btrim(p_first_name),
           last_name         = btrim(p_last_name),
           preferred_name    = coalesce(nullif(btrim(p_preferred_name), ''), preferred_name),
           class_year        = coalesce(p_class_year, class_year),
           phone             = coalesce(nullif(btrim(p_phone), ''), phone),
           phone_shared      = coalesce(p_phone_shared, phone_shared),
           user_id           = coalesce(user_id, p_user_id),
           email_verified_at = coalesce(email_verified_at, now()),
           updated_at        = now()
     where id = v_row.id
     returning * into v_row;
  end if;

  return jsonb_build_object('ok', true, 'pnm_id', v_row.id, 'created', v_created);
end;
$$;

revoke all on function public.upsert_verified_pnm(uuid, text, text, text, text, smallint, text, boolean, text, uuid)
  from public, anon, authenticated;

-- A PNM's interest in a chapter, written by their own action (D7): the
-- chapter's form, their council registration, or a council import of their
-- own list. With a council and term, it also registers them with that
-- council for the season. Refuses an unverified PNM (being on a school's
-- list isn't consent to be recruited), a chapter not at the PNM's school,
-- an `nphc`-archetype chapter (council-types.md § What Frapp must not do),
-- and a council whose model is `none`. The chapter's candidate row comes
-- with the form, in the next slice.
create or replace function public.record_pnm_interest(
  p_pnm_id       uuid,
  p_chapter_id   uuid,
  p_source       text,
  p_source_label text,
  p_council_id   uuid,
  p_term         text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pnm public.pnms;
  v_chapter public.chapters;
  v_council public.chapters;
  v_season public.council_recruitment_seasons;
  v_registration_id uuid;
  v_interest public.pnm_interests;
begin
  select * into v_pnm from public.pnms where id = public.pnm_survivor(p_pnm_id);
  if v_pnm.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_pnm.email_verified_at is null then
    return jsonb_build_object('ok', false, 'reason', 'unverified');
  end if;

  select * into v_chapter from public.chapters where id = p_chapter_id;
  if v_chapter.id is null or v_chapter.kind <> 'chapter' then
    return jsonb_build_object('ok', false, 'reason', 'wrong_kind');
  end if;
  if v_chapter.org_archetype = 'nphc' then
    return jsonb_build_object('ok', false, 'reason', 'chapter_refuses');
  end if;
  if not exists (
    select 1 from public.school_chapters
     where chapter_id = p_chapter_id and status = 'active' and school_id = v_pnm.school_id
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_at_school');
  end if;

  if p_council_id is not null then
    select * into v_council from public.chapters where id = p_council_id;
    if v_council.id is null or v_council.kind <> 'council'
       or v_council.council_school_id <> v_pnm.school_id then
      return jsonb_build_object('ok', false, 'reason', 'wrong_kind');
    end if;
    if v_council.recruitment_model = 'none' then
      return jsonb_build_object('ok', false, 'reason', 'council_model_none');
    end if;
    if not exists (
      select 1 from public.council_chapters
       where council_id = p_council_id and chapter_id = p_chapter_id and status = 'accepted'
    ) then
      return jsonb_build_object('ok', false, 'reason', 'not_affiliated');
    end if;
    select * into v_season
      from public.council_recruitment_seasons
     where council_id = p_council_id and term = p_term;
    if v_season.council_id is null or v_season.status <> 'open' then
      return jsonb_build_object('ok', false, 'reason', 'season_closed');
    end if;
    insert into public.pnm_council_registrations (pnm_id, council_id, term)
    values (v_pnm.id, p_council_id, p_term)
    on conflict (pnm_id, council_id, term) do update
      set status = case when pnm_council_registrations.status = 'withdrawn'
                        then 'registered' else pnm_council_registrations.status end
    returning id into v_registration_id;
  end if;

  insert into public.pnm_interests (pnm_id, chapter_id, registration_id, source, source_label)
  values (v_pnm.id, p_chapter_id, v_registration_id, p_source, nullif(btrim(p_source_label), ''))
  on conflict (pnm_id, chapter_id) do update
    set withdrawn_at = null,
        registration_id = coalesce(excluded.registration_id, pnm_interests.registration_id)
  returning * into v_interest;

  update public.pnms set updated_at = now() where id = v_pnm.id;

  return jsonb_build_object(
    'ok', true,
    'pnm_id', v_pnm.id,
    'interest_id', v_interest.id,
    'registration_id', v_registration_id
  );
end;
$$;

revoke all on function public.record_pnm_interest(uuid, uuid, text, text, uuid, text)
  from public, anon, authenticated;

-- A council officer merges two records of one person (§ 2.5 "Merging
-- duplicates"): both at the council's school, both on its master list, and
-- neither already merged. Two different accounts are two people, so that is
-- refused. In one transaction it moves the loser's registrations and
-- interests to the survivor (dropping any the survivor already has),
-- repoints each chapter's candidate where that chapter has none for the
-- survivor yet (a chapter that has both keeps both until it merges them
-- itself, and the count comes back), keeps the earlier `created_at`, and
-- logs both sides as they were.
create or replace function public.merge_pnms(
  p_council_id uuid,
  p_survivor   uuid,
  p_loser      uuid,
  p_actor      uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_council public.chapters;
  v_survivor public.pnms;
  v_loser public.pnms;
  v_conflicts int;
begin
  if p_survivor = p_loser then
    return jsonb_build_object('ok', false, 'reason', 'same_record');
  end if;

  select * into v_council from public.chapters where id = p_council_id;
  if v_council.id is null or v_council.kind <> 'council' then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Both rows, locked in id order so two merges can't deadlock.
  perform 1 from public.pnms where id in (p_survivor, p_loser) order by id for update;
  select * into v_survivor from public.pnms where id = p_survivor;
  select * into v_loser from public.pnms where id = p_loser;

  if v_survivor.id is null or v_loser.id is null
     or v_survivor.school_id <> v_council.council_school_id
     or v_loser.school_id <> v_council.council_school_id then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_survivor.merged_into_id is not null or v_loser.merged_into_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_merged');
  end if;
  if not exists (select 1 from public.pnm_council_registrations
                     where pnm_id = p_survivor and council_id = p_council_id)
     or not exists (select 1 from public.pnm_council_registrations
                     where pnm_id = p_loser and council_id = p_council_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_survivor.user_id is not null and v_loser.user_id is not null
     and v_survivor.user_id <> v_loser.user_id then
    return jsonb_build_object('ok', false, 'reason', 'two_accounts');
  end if;

  insert into public.pnm_merges (council_id, survivor_id, loser_id, actor_user_id, survivor_before, loser_before)
  values (p_council_id, p_survivor, p_loser, p_actor, to_jsonb(v_survivor), to_jsonb(v_loser));

  -- 1. Registrations and interests.
  delete from public.pnm_council_registrations l
   using public.pnm_council_registrations s
   where l.pnm_id = p_loser and s.pnm_id = p_survivor
     and s.council_id = l.council_id and s.term = l.term;
  update public.pnm_council_registrations set pnm_id = p_survivor where pnm_id = p_loser;

  delete from public.pnm_interests l
   using public.pnm_interests s
   where l.pnm_id = p_loser and s.pnm_id = p_survivor and s.chapter_id = l.chapter_id;
  update public.pnm_interests set pnm_id = p_survivor where pnm_id = p_loser;

  -- 2. Chapter candidates.
  update public.rush_candidates rc
     set pnm_id = p_survivor
   where rc.pnm_id = p_loser
     and not exists (
       select 1 from public.rush_candidates o
        where o.chapter_id = rc.chapter_id and o.pnm_id = p_survivor
     );
  select count(*) into v_conflicts from public.rush_candidates where pnm_id = p_loser;

  -- 3. The survivor keeps the earlier start and fills its gaps; the loser,
  --    and anything merged into it before, points at the survivor.
  update public.pnms
     set created_at        = least(v_survivor.created_at, v_loser.created_at),
         user_id           = coalesce(v_survivor.user_id, v_loser.user_id),
         email_verified_at = coalesce(v_survivor.email_verified_at, v_loser.email_verified_at),
         preferred_name    = coalesce(v_survivor.preferred_name, v_loser.preferred_name),
         class_year        = coalesce(v_survivor.class_year, v_loser.class_year),
         updated_at        = now()
   where id = p_survivor;
  update public.pnms set merged_into_id = p_survivor where merged_into_id = p_loser;
  update public.pnms set merged_into_id = p_survivor, user_id = null, updated_at = now()
   where id = p_loser;

  return jsonb_build_object('ok', true, 'survivor_id', p_survivor, 'candidate_conflicts', v_conflicts);
end;
$$;

revoke all on function public.merge_pnms(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;

-- Deletes a PNM and everything keyed to them: registrations, interests,
-- merge log rows and the records merged into them. Each chapter keeps its
-- own candidate row, unlinked (§ 3.5).
create or replace function public.delete_pnm(p_pnm_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := public.pnm_survivor(p_pnm_id);
  v_count int;
begin
  if v_id is null then
    return 0;
  end if;
  delete from public.pnms where id = v_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.delete_pnm(uuid)
  from public, anon, authenticated;

-- The retention sweep (§ 3.5, ifc-recruitment.md § Retention and deletion;
-- Paul, #4218: 180 days). A PNM on a master list goes once every season they
-- registered for has closed plus that council's N days (default 180, at
-- most 180). A PNM on no master list (only chapter forms) goes 180 days
-- after their last interest or update. Returns how many it deleted.
create or replace function public.purge_expired_pnms(p_now timestamptz)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  with due as (
    select p.id
      from public.pnms p
     where p.merged_into_id is null
       and (
         case
           when exists (select 1 from public.pnm_council_registrations r where r.pnm_id = p.id) then
             (select max(s.closes_at + make_interval(days => s.pnm_retention_days))
                from public.pnm_council_registrations r
                join public.council_recruitment_seasons s
                  on s.council_id = r.council_id and s.term = r.term
               where r.pnm_id = p.id)
           else
             greatest(
               p.updated_at,
               coalesce((select max(i.created_at) from public.pnm_interests i where i.pnm_id = p.id),
                        p.updated_at)
             ) + interval '180 days'
         end
       ) < p_now
  )
  delete from public.pnms p using due where p.id = due.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.purge_expired_pnms(timestamptz)
  from public, anon, authenticated;

-- Account deletion also deletes the person's PNM records (§ 3.5), whichever
-- path writes the tombstone. Each chapter keeps its candidate row, unlinked.
create or replace function public.users_drop_school_rows()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.school_members where user_id = new.id;
  delete from public.school_email_verifications where user_id = new.id;
  delete from public.pnms where user_id = new.id;
  return null;
end;
$$;

revoke all on function public.users_drop_school_rows()
  from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.set_school_chapter_status(uuid, uuid, text, uuid) to service_role;
    grant execute on function public.set_council_chapter_status(uuid, uuid, text, text, uuid) to service_role;
    grant execute on function public.upsert_verified_pnm(uuid, text, text, text, text, smallint, text, boolean, text, uuid) to service_role;
    grant execute on function public.record_pnm_interest(uuid, uuid, text, text, uuid, text) to service_role;
    grant execute on function public.merge_pnms(uuid, uuid, uuid, uuid) to service_role;
    grant execute on function public.delete_pnm(uuid) to service_role;
    grant execute on function public.purge_expired_pnms(timestamptz) to service_role;
  end if;
end
$$;
