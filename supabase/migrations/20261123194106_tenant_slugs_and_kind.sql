-- ADR-27 rollout step 1, API only (#5918, plan on #5833): every tenant gets a
-- kind and a URL slug. `spec/architecture/adr/adr-27.md` decisions 3 and 5.
--
-- WHAT CHANGES
--
-- 1. `chapters.kind`: `chapter` or `council`, default `chapter`. A council is
--    a tenant in the same table (#4192, option C). Kind is never read from
--    `org_archetype`, where `ifc` already means an IFC-member fraternity.
--    Every row today is a chapter, so the default is the backfill.
--
-- 2. `tenant_slugs(slug, chapter_id, retired_at)`: one registry for chapters
--    and councils.
--
--      - The primary key spans current and retired slugs, so a slug is never
--        handed to a second tenant, even in a race, and an old link, QR code
--        or invite can never land in a different chapter.
--      - A partial unique index allows one current slug (no `retired_at`) per
--        tenant.
--      - A tenant may take back its own retired slug by clearing that row's
--        `retired_at` (after retiring its current one), which can't loop.
--      - The format is the ADR's: 3 to 40 of `a-z`, `0-9` and single inner
--        hyphens, ASCII only. The same pattern is `TENANT_SLUG_PATTERN` in
--        `@repo/validation`.
--      - `chapter_id` is `on delete set null`, not cascade: a deleted
--        tenant's slugs stay in the table, ownerless, so they are never
--        reused either. Nothing in the API deletes a chapter today.
--      - A row's slug and owner never change once written: a BEFORE UPDATE
--        trigger refuses a new `slug`, and a new `chapter_id` other than the
--        null the foreign key's `set null` writes. So an UPDATE (or an
--        `on conflict do update`) can't hand a retired or ownerless slug to
--        another tenant either; only `retired_at` moves.
--      - RLS on with no policies: the API is the only reader and writer,
--        through the service-role client. A member reads a slug through
--        `GET /v1/chapters` and `GET /v1/tenants/resolve`.
--
-- 3. Every chapter gets its default slug, oldest chapter first, and every
--    chapter inserted from now on gets one from an AFTER INSERT trigger, so
--    "every tenant has exactly one current slug" holds however a row is made
--    (onboarding, the demo seed, a hand insert).
--
--      Default: the organization's short name plus the school's, such as
--      `fiji-rpi`. From the directory row when the chapter links one: its
--      first org alias (else its org name) and `university_short` (else the
--      chapter's `university`). With no school, the organization plus its
--      chapter designation. With no directory row, the chapter's own `name`
--      and `university`. A taken or reserved slug gets `-2`, `-3`, ….
--
--      The reserved words are `is_reserved_tenant_slug`'s. Their canonical
--      list is `RESERVED_TENANT_SLUGS` in `@repo/validation`, and
--      `tenant-slug-reserved-lockstep.spec.ts` fails when the two differ, so
--      a word added there needs a migration that redefines this function.
--
-- 4. `get_request_context` adds `kind` to its `chapter` part, because
--    `ChapterGuard` now refuses a tenant of a kind the route doesn't serve.
--    Same arguments, same grants (`create or replace` keeps them).
--
-- Locks. Adding `kind` with a constant default rewrites nothing; its CHECK
-- scans `chapters` once under ACCESS EXCLUSIVE, a table of one row per
-- chapter. The new table's foreign key takes SHARE ROW EXCLUSIVE on
-- `chapters`, and the trigger's creation takes SHARE ROW EXCLUSIVE too.

-- 1. ------------------------------------------------------------------------

alter table public.chapters
  add column if not exists kind text not null default 'chapter'
    constraint chapters_kind_check check (kind in ('chapter', 'council'));

comment on column public.chapters.kind is
  'Tenant kind (ADR-27): chapter or council. Routes declare the kinds they serve; never derived from org_archetype.';

-- 2. ------------------------------------------------------------------------

create table if not exists public.tenant_slugs (
  slug text primary key
    constraint tenant_slugs_slug_format
      check (slug ~ '^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,39}$'),
  chapter_id uuid references public.chapters(id) on delete set null,
  retired_at timestamptz,
  created_at timestamptz not null default now()
);

-- One current slug per tenant.
create unique index if not exists tenant_slugs_one_current_per_tenant
  on public.tenant_slugs (chapter_id)
  where retired_at is null;

-- The foreign key's own lookups, and a tenant's retired slugs.
create index if not exists idx_tenant_slugs_chapter_id
  on public.tenant_slugs (chapter_id);

alter table public.tenant_slugs enable row level security;

comment on table public.tenant_slugs is
  'ADR-27 slug registry for chapters and councils. The primary key spans retired slugs, so no slug is ever reused by another tenant.';

-- 3. ------------------------------------------------------------------------

-- Words no tenant may hold (ADR-27 decision 5). Canonical list:
-- `RESERVED_TENANT_SLUGS` in `@repo/validation`.
create or replace function public.is_reserved_tenant_slug(p_slug text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_slug = any (array[
    -- platform words
    'new', 'join', 'start', 'me', 'settings', 'admin', 'api', 'app', 'www',
    'help', 'support', 'status', 'frapp', 'signet', 'staff', 'official',
    -- council words on their own
    'ifc', 'panhellenic', 'phc', 'nphc', 'mgc', 'council', 'school',
    -- the web's first-level route names (`c`, `s` and `f` are too short to
    -- be a slug at all)
    'activity', 'alumni', 'ask', 'auth', 'backwork', 'billing', 'chat',
    'chat-admin', 'check-in', 'dashboard', 'discord-import', 'documents',
    'events', 'geofences', 'meetings', 'members', 'no-access', 'points',
    'preferences', 'profile', 'reports', 'roles', 'service', 'sign-in',
    'sign-up', 'study', 'tasks', 'welcome', 'whats-new'
  ]::text[]);
$$;

-- Lower case, every run of anything but `a-z0-9` as one hyphen, trimmed.
create or replace function public.tenant_slug_part(p_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select trim(both '-' from
    regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'));
$$;

-- The default slug before any collision number, at most 36 characters so
-- `-NN` still fits in 40.
create or replace function public.default_tenant_slug_base(p_chapter_id uuid)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_org text;
  v_school text;
  v_designation text;
  v_base text;
begin
  select
    coalesce(
      nullif(public.tenant_slug_part(d.org_aliases[1]), ''),
      nullif(public.tenant_slug_part(d.org_name), ''),
      public.tenant_slug_part(c.name)
    ),
    coalesce(
      nullif(public.tenant_slug_part(d.university_short), ''),
      public.tenant_slug_part(c.university)
    ),
    public.tenant_slug_part(d.chapter_designation)
  into v_org, v_school, v_designation
  from public.chapters c
  left join public.chapter_directory d on d.id = c.directory_id
  where c.id = p_chapter_id;

  v_org := left(coalesce(v_org, ''), 20);
  v_base := concat_ws('-',
    nullif(trim(both '-' from v_org), ''),
    nullif(coalesce(nullif(v_school, ''), v_designation), ''));
  v_base := trim(both '-' from left(coalesce(v_base, ''), 36));

  if char_length(v_base) < 3 then
    v_base := 'chapter';
  end if;
  return v_base;
end;
$$;

-- Gives a tenant its default slug unless it already has a current one, and
-- returns the current slug either way.
create or replace function public.assign_default_tenant_slug(p_chapter_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_base text;
  v_candidate text;
  v_current text;
  v_n integer := 1;
begin
  select slug into v_current
  from public.tenant_slugs
  where chapter_id = p_chapter_id and retired_at is null;
  if v_current is not null then
    return v_current;
  end if;

  v_base := public.default_tenant_slug_base(p_chapter_id);
  v_candidate := v_base;
  loop
    if not public.is_reserved_tenant_slug(v_candidate) then
      begin
        insert into public.tenant_slugs (slug, chapter_id)
        values (v_candidate, p_chapter_id);
        return v_candidate;
      exception when unique_violation then
        -- The slug is someone's (current or retired), or a concurrent call
        -- just gave this tenant its slug.
        select slug into v_current
        from public.tenant_slugs
        where chapter_id = p_chapter_id and retired_at is null;
        if v_current is not null then
          return v_current;
        end if;
      end;
    end if;
    v_n := v_n + 1;
    v_candidate := v_base || '-' || v_n;
  end loop;
end;
$$;

revoke all on function public.assign_default_tenant_slug(uuid)
  from public, anon, authenticated;
revoke all on function public.default_tenant_slug_base(uuid)
  from public, anon, authenticated;

create or replace function public.chapters_assign_tenant_slug()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assign_default_tenant_slug(new.id);
  return null;
end;
$$;

revoke all on function public.chapters_assign_tenant_slug()
  from public, anon, authenticated;

drop trigger if exists chapters_assign_tenant_slug on public.chapters;
create trigger chapters_assign_tenant_slug
  after insert on public.chapters
  for each row execute function public.chapters_assign_tenant_slug();

-- A slug belongs to one tenant for good: only `retired_at` may change, and
-- `chapter_id` only to the null a deleted tenant's foreign key writes.
create or replace function public.tenant_slugs_keep_owner()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.slug is distinct from old.slug then
    raise exception 'tenant_slugs: a slug is never renamed; retire it and insert a new one'
      using errcode = 'check_violation';
  end if;
  if new.chapter_id is distinct from old.chapter_id
     and new.chapter_id is not null then
    raise exception 'tenant_slugs: a slug never moves to another tenant'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.tenant_slugs_keep_owner()
  from public, anon, authenticated;

drop trigger if exists tenant_slugs_keep_owner on public.tenant_slugs;
create trigger tenant_slugs_keep_owner
  before update on public.tenant_slugs
  for each row execute function public.tenant_slugs_keep_owner();

-- Gives every chapter without a current slug its default, the oldest first,
-- so on a tie the oldest chapter keeps the unnumbered slug. Returns how many
-- it assigned. A function rather than a bare block so the PGlite tier can run
-- the backfill itself: no chapter exists when the migrations apply there.
create or replace function public.backfill_tenant_slugs()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_assigned integer := 0;
begin
  for r in
    select c.id
    from public.chapters c
    where not exists (
      select 1 from public.tenant_slugs t
      where t.chapter_id = c.id and t.retired_at is null
    )
    order by c.created_at, c.id
  loop
    perform public.assign_default_tenant_slug(r.id);
    v_assigned := v_assigned + 1;
  end loop;
  return v_assigned;
end;
$$;

revoke all on function public.backfill_tenant_slugs()
  from public, anon, authenticated;

select public.backfill_tenant_slugs();

-- 4. ------------------------------------------------------------------------

create or replace function public.get_request_context(
  p_auth_id    uuid,
  p_chapter_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with app_user as (
    select u.id
    from users u
    where u.supabase_auth_id = p_auth_id
      and u.deleted_at is null
  ),
  membership as (
    select m.*
    from members m
    join app_user u on m.user_id = u.id
    where m.chapter_id = p_chapter_id
  )
  select jsonb_build_object(
    'user', (select jsonb_build_object('id', u.id) from app_user u),
    'chapter', (
      select jsonb_build_object(
        'subscription_status', c.subscription_status,
        'past_due_since', c.past_due_since,
        'enabled_modules', c.enabled_modules,
        'kind', c.kind
      )
      from chapters c
      where c.id = p_chapter_id
    ),
    'member', (select to_jsonb(m) from membership m),
    'roles', (
      select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
      from roles r
      join membership m on r.id = any (m.role_ids::uuid[])
      where r.chapter_id = p_chapter_id
    )
  );
$$;
