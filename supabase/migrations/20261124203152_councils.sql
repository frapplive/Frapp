-- Councils as a tenant kind (#5933, plan on #5833).
-- `spec/architecture/school-layer.md` § 2.3 and § 5.3,
-- `spec/behavior/council-types.md` § Council profiles,
-- `spec/architecture/adr/adr-27.md` decision 3.
--
-- 1. The council columns on `chapters`, as § 2.3 writes them, plus the
--    council's school (`council_school_id`). § 2.3's sketch had no column for
--    "its school link", and `school_chapters` is the affiliation table that
--    an officer confirms (§ 2.4), which this slice doesn't build, so the
--    school a council was created at is a column of the council itself.
--    `on delete restrict`: a school with councils isn't deleted out from
--    under them (`chapters_council_fields_kind` would refuse the null anyway).
-- 2. `chapters_council_fields_kind`: a council has a type, a model its type
--    allows, a school and the `council` archetype marker; a chapter has none
--    of them. Added `not valid` and then validated, so the long lock is only
--    the validation scan (§ 2.3 "Writing the constraint").
-- 3. One council of a type per school, except `other` (§ 2.3), as a partial
--    unique index, so two founders racing each other can't both win.
-- 4. `custom_access_token_hook` auto-resolves the claim from chapter-kind
--    memberships only (#5925's review). The claim is the context every
--    shipped phone sends as `x-chapter-id`, and a shipped phone serves only
--    chapter routes, so a member of one chapter and one council still gets
--    their chapter by default. A tenant the person chose (`active_chapter_id`)
--    stays the claim whatever its kind: an explicit choice is the person's.
--    The hook now reads `chapters`, so `supabase_auth_admin` gets the same
--    read-only grant and policy it has on `users` and `members`.
--
-- Locks. The new columns are nullable with no default, which rewrites
-- nothing. `chapters` is small (one row per tenant), so building the two
-- indexes without `concurrently` holds its SHARE lock for milliseconds.

-- 1. Columns ---------------------------------------------------------------------

alter table public.chapters
  add column if not exists council_type text
    constraint chapters_council_type_check
    check (council_type in ('ifc', 'panhellenic', 'nphc', 'mgc', 'other')),
  add column if not exists council_school_id uuid
    references public.schools(id) on delete restrict,
  add column if not exists council_verified_at timestamptz,
  add column if not exists council_verified_by uuid
    references public.users(id) on delete set null,
  add column if not exists recruitment_model text
    constraint chapters_recruitment_model_check
    check (recruitment_model in ('open_bidding', 'formal', 'none'));

comment on column public.chapters.council_type is
  'A council''s type (school-layer.md § 2.3): ifc, panhellenic, nphc, mgc or other. Selects its council profile (COUNCIL_PROFILES). Null on a chapter.';
comment on column public.chapters.council_school_id is
  'The school a council was created at (#5933). Null on a chapter, whose school link is school_chapters.';
comment on column public.chapters.council_verified_at is
  'When Frapp staff (later the school''s FSL office) verified the council (school-layer.md § 5.3). Null until then; always null on a chapter.';
comment on column public.chapters.recruitment_model is
  'A council''s recruitment model (council-types.md § Recruitment models): open_bidding, formal or none, within what its type allows. Null on a chapter.';

-- 2. Fields follow the kind ------------------------------------------------------

alter table public.chapters
  drop constraint if exists chapters_council_fields_kind;
alter table public.chapters
  add constraint chapters_council_fields_kind check (
    (kind = 'council') = (council_type is not null)
    and (kind = 'council') = (recruitment_model is not null)
    and (kind = 'council') = (council_school_id is not null)
    and (kind = 'council') = (coalesce(org_archetype, '') = 'council')
    and (kind = 'council' or council_verified_at is null)
    and (council_type is null
      or (council_type = 'ifc'            and recruitment_model in ('open_bidding', 'none'))
      or (council_type = 'panhellenic'    and recruitment_model in ('formal', 'none'))
      or (council_type in ('nphc', 'mgc') and recruitment_model = 'none')
      or (council_type = 'other'          and recruitment_model in ('open_bidding', 'none')))
  ) not valid;
alter table public.chapters validate constraint chapters_council_fields_kind;

-- 3. One council of a type per school --------------------------------------------

create unique index if not exists chapters_one_council_per_type
  on public.chapters (council_school_id, council_type)
  where kind = 'council' and council_type <> 'other';

create index if not exists idx_chapters_council_school_id
  on public.chapters (council_school_id)
  where council_school_id is not null;

create index if not exists idx_chapters_council_verified_by
  on public.chapters (council_verified_by)
  where council_verified_by is not null;

-- 4. The token hook's default counts chapters only --------------------------------

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_claims          jsonb;
  v_user_id         uuid;
  v_active          uuid;
  v_membership_count int;
begin
  select u.id, u.active_chapter_id
    into v_user_id, v_active
    from public.users u
   where u.supabase_auth_id = (event->>'user_id')::uuid;

  -- No app-side profile yet (sign-up before the AuthSyncInterceptor runs).
  if v_user_id is null then
    return event;
  end if;

  -- A persisted selection only counts while the membership still exists. It
  -- counts whatever the tenant's kind: the person chose it.
  if v_active is not null then
    if not exists (
      select 1
        from public.members m
       where m.user_id = v_user_id
         and m.chapter_id = v_active
    ) then
      v_active := null;
    end if;
  end if;

  -- Auto-resolve only when the person belongs to exactly one chapter-kind
  -- tenant (#5933). A council membership beside it doesn't make the default
  -- ambiguous, and a council alone is never the default: every shipped phone
  -- sends the claim to chapter routes.
  if v_active is null then
    select count(*) into v_membership_count
      from public.members m
      join public.chapters c on c.id = m.chapter_id
     where m.user_id = v_user_id
       and c.kind = 'chapter';

    if v_membership_count = 1 then
      select m.chapter_id into v_active
        from public.members m
        join public.chapters c on c.id = m.chapter_id
       where m.user_id = v_user_id
         and c.kind = 'chapter';
    end if;
  end if;

  if v_active is null then
    return event;
  end if;

  v_claims := event->'claims';
  v_claims := jsonb_set(v_claims, '{active_chapter_id}', to_jsonb(v_active::text));
  return jsonb_set(event, '{claims}', v_claims);
exception
  when others then
    -- Never block token issuance (20260802120000's header note).
    return event;
end;
$$;

revoke execute on function public.custom_access_token_hook(jsonb) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.custom_access_token_hook(jsonb) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.custom_access_token_hook(jsonb) from authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
    -- The hook now reads `chapters.kind`. Scoped to `supabase_auth_admin`, as
    -- the `users` and `members` policies in 20260802120000 are; the API uses
    -- the service role, which bypasses RLS, so no other caller's view changes.
    grant select on table public.chapters to supabase_auth_admin;
    drop policy if exists "auth_admin_can_read_chapters" on public.chapters;
    create policy "auth_admin_can_read_chapters"
      on public.chapters
      as permissive
      for select
      to supabase_auth_admin
      using (true);
  end if;
end
$$;
