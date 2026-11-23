-- School layer 1 (#5929, plan on #5833): schools, their email domains and
-- slugs, school membership, school-email verification codes, and a minimal
-- `school_chapters`. `spec/architecture/school-layer.md` § 2.1, § 2.2, § 4.1
-- and § 7; ADR-27 decisions 3 and 5.
--
-- WHAT CHANGES
--
-- 1. `schools`: one row per school, seeded from `chapter_directory`'s
--    universities (§ 7 step 2). `directory_university` is the exact
--    `chapter_directory.university` the row was seeded from, so a chapter that
--    links a directory row finds its school without fuzzy matching. Every
--    school starts `unverified`: its students can't verify until staff verify
--    the school and one of its domains (a data fix, per environment).
--
-- 2. `school_email_domains`: a school's domains are rows, and a verified domain
--    belongs to exactly one school (the partial unique index). Nothing seeds a
--    domain: our data has none (§ 7 step 4; Winston, 2026-11-23, #5929).
--    `verify_school_domain` is the only way a domain becomes verified, and it
--    refuses one that equals, contains or sits under another school's verified
--    domain when `include_subdomains` reaches it, under a lock on the table.
--
-- 3. `school_slugs(slug, school_id, retired_at)`: ADR-27 decision 5's registry
--    for schools, the same shape and rules as `tenant_slugs` (the primary key
--    spans retired slugs, one current slug per school, a slug never renamed or
--    moved). Only Frapp staff rename a school, so no API writes it.
--
--      Default (Winston, 2026-11-23, #5929): the school's short name when that
--      short name names only this school across the directory (`rpi`);
--      otherwise its full name (`arizona-state-university`, since "ASU" names
--      eight schools). A short name under 3 characters or a reserved word
--      falls back to the full name. A taken slug gets `-2`, `-3`, ….
--
-- 4. `school_members`: a person's own record at a school (D4), apart from
--    `members`. A row needs an account and exists only once the person proved
--    a school address by code (or, later, SSO or staff). Leaving a chapter
--    never touches it.
--
-- 5. `school_email_verifications`: the one-time codes. The code itself is
--    never stored, only a salted SHA-256 of it. Codes are counted per mailbox
--    (`school_email_key`, which folds `+tags`), per IP and per account over a
--    rolling hour, under advisory locks, by `start_school_email_verification`,
--    and checked by `confirm_school_email_verification`, which also writes the
--    `school_members` row. An address's domain is read after its last `@`
--    (`school_email_domain`). The IP is an unkeyed hash: it keeps the raw
--    address out of the table but is not anonymous. Rows older than a day are
--    deleted when the next code is asked for. A code whose email didn't go
--    out is deleted (`discard_school_email_verification`).
--
-- 6. `search_schools` finds a school by name, short name or alias for the
--    onboarding step.
--
-- 7. `school_chapters`, minimal (Winston, 2026-11-23, #5929): § 2.4's table
--    with only `proposed` and `active`. Chapter setup's Find step writes
--    `proposed` when the matched directory row has a school; an officer
--    confirms later (§ 7 step 3). § 2.4 widens it (declined, ended, councils).
--    Existing chapters get no link here: § 7's reviewed sheet does that.
--
-- 8. `anonymize_user` is not redefined. A trigger on the `users` tombstone
--    deletes the person's `school_members` and verification rows instead
--    (§ 3.5's scrub), so the next migration that redefines `anonymize_user`
--    can't drop it.
--
-- Every new table: RLS on, no policies, no realtime (§ 4.1). The API reaches
-- them through the service-role client; every function here is service-role
-- only with `search_path` pinned.
--
-- Locks. All new tables. The foreign keys take SHARE ROW EXCLUSIVE on
-- `users`, `chapters` and `chapter_directory` briefly; the `users` trigger's
-- creation takes SHARE ROW EXCLUSIVE on `users`. Existing rows are read, never
-- written: no `chapters`, `members`, `roles` or `users` value changes.

-- 1. schools ------------------------------------------------------------------

create table if not exists public.schools (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  short_name           text not null,
  aliases              text[] not null default '{}',
  status               text not null default 'unverified'
                       constraint schools_status_check
                       check (status in ('unverified', 'verified', 'suspended')),
  directory_university text,
  created_by           uuid references public.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint schools_directory_university_key unique (directory_university)
);

create index if not exists idx_schools_created_by
  on public.schools (created_by);

alter table public.schools enable row level security;

comment on table public.schools is
  'School layer (school-layer.md § 2.1). Seeded from chapter_directory universities; starts unverified.';
comment on column public.schools.directory_university is
  'The exact chapter_directory.university this school was seeded from, so a directory match finds its school.';

-- 2. school_email_domains -------------------------------------------------------

create table if not exists public.school_email_domains (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools(id) on delete cascade,
  domain             text not null,
  include_subdomains boolean not null default false,
  status             text not null default 'proposed'
                     constraint school_email_domains_status_check
                     check (status in ('proposed', 'verified', 'rejected')),
  verified_via       text
                     constraint school_email_domains_verified_via_check
                     check (verified_via in ('edu_match', 'staff')),
  verified_by        uuid references public.users(id) on delete set null,
  verified_at        timestamptz,
  created_at         timestamptz not null default now(),
  constraint school_email_domains_domain_shape
    check (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$')
);

-- A verified domain belongs to one school. Proposing reserves nothing.
create unique index if not exists school_email_domains_verified_key
  on public.school_email_domains (domain) where status = 'verified';

create index if not exists idx_school_email_domains_school_id
  on public.school_email_domains (school_id);
create index if not exists idx_school_email_domains_verified_by
  on public.school_email_domains (verified_by);

alter table public.school_email_domains enable row level security;

comment on table public.school_email_domains is
  'A school''s email domains (school-layer.md § 2.1). Only verify_school_domain verifies one.';

-- 3. school_slugs ---------------------------------------------------------------

create table if not exists public.school_slugs (
  slug       text primary key
    constraint school_slugs_slug_format
      check (slug ~ '^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,39}$'),
  school_id  uuid references public.schools(id) on delete set null,
  retired_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists school_slugs_one_current_per_school
  on public.school_slugs (school_id)
  where retired_at is null;

create index if not exists idx_school_slugs_school_id
  on public.school_slugs (school_id);

alter table public.school_slugs enable row level security;

comment on table public.school_slugs is
  'ADR-27 slug registry for schools. The primary key spans retired slugs, so no slug is ever reused by another school. Staff rename only.';

-- 4. school_members -------------------------------------------------------------

-- An address's domain, read after its LAST `@`, the way mail is delivered and
-- `@IsEmail` reads it. (`split_part(…, '@', 2)` would read after the first,
-- and a quoted local part such as `"a@rpi.edu@x"@evil.com` would pass the
-- school's domain check while the code went to evil.com.)
create or replace function public.school_email_domain(p_email text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(substring(lower(btrim(p_email)) from '@([^@]*)$'), '');
$$;

-- The mailbox an address reaches, for "one address proves one account" and
-- the per-address ceiling: lower case, with a `+tag` dropped from the local
-- part, since Google Workspace and Microsoft 365 deliver `alice+b@` to
-- `alice@`. Without it one mailbox could verify an account per tag.
create or replace function public.school_email_key(p_email text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select regexp_replace(
           substring(lower(btrim(p_email)) from '^(.*)@[^@]*$'),
           '\+.*$', ''
         )
         || '@' || public.school_email_domain(p_email);
$$;

create table if not exists public.school_members (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null references public.schools(id) on delete cascade,
  user_id              uuid not null references public.users(id) on delete cascade,
  status               text not null
                       constraint school_members_status_check
                       check (status in ('pnm', 'member', 'alum')),
  verified_via         text not null
                       constraint school_members_verified_via_check
                       check (verified_via in ('email_code', 'sso', 'staff')),
  verified_email       text,
  verified_at          timestamptz not null,
  directory_visibility text not null default 'hidden'
                       constraint school_members_directory_visibility_check
                       check (directory_visibility in ('hidden', 'officers', 'school')),
  left_at              timestamptz,
  created_at           timestamptz not null default now(),
  constraint school_members_school_user_key unique (school_id, user_id)
);

-- One mailbox proves one account per school (`school_email_key` folds
-- `+tags`), whatever its spelling.
create unique index if not exists school_members_verified_email_key
  on public.school_members (school_id, public.school_email_key(verified_email))
  where verified_email is not null;

create index if not exists idx_school_members_user_id
  on public.school_members (user_id);

alter table public.school_members enable row level security;

comment on table public.school_members is
  'A person''s own record at a school (school-layer.md § 2.2, D4). Needs an account and a verified school address; never created by a chapter membership.';

-- 5. school_email_verifications --------------------------------------------------

create table if not exists public.school_email_verifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  school_id  uuid not null references public.schools(id) on delete cascade,
  email      text not null,
  code_salt  text not null,
  code_hash  text not null,
  ip_hash    text,
  attempts   integer not null default 0
             constraint school_email_verifications_attempts_check
             check (attempts >= 0),
  expires_at timestamptz not null,
  closed_at  timestamptz,
  outcome    text
             constraint school_email_verifications_outcome_check
             check (outcome in ('verified', 'superseded', 'exhausted')),
  created_at timestamptz not null default now()
);

create index if not exists idx_school_email_verifications_user_school
  on public.school_email_verifications (user_id, school_id, created_at desc);
create index if not exists idx_school_email_verifications_email
  on public.school_email_verifications (public.school_email_key(email), created_at);
create index if not exists idx_school_email_verifications_ip
  on public.school_email_verifications (ip_hash, created_at);
create index if not exists idx_school_email_verifications_school_id
  on public.school_email_verifications (school_id);
create index if not exists idx_school_email_verifications_created_at
  on public.school_email_verifications (created_at);

alter table public.school_email_verifications enable row level security;

comment on table public.school_email_verifications is
  'School-email one-time codes (school-layer.md § 2.2). Stores a salted hash, never the code; rows older than a day are deleted when the next code is asked for.';

-- 6. school_chapters (minimal) ------------------------------------------------------

create table if not exists public.school_chapters (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  chapter_id   uuid not null references public.chapters(id) on delete cascade,
  is_primary   boolean not null default true,
  status       text not null default 'proposed'
               constraint school_chapters_status_check
               check (status in ('proposed', 'active')),
  proposed_by  uuid references public.users(id) on delete set null,
  confirmed_by uuid references public.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at   timestamptz not null default now()
);

create unique index if not exists school_chapters_one_primary
  on public.school_chapters (chapter_id) where is_primary and status = 'active';
create unique index if not exists school_chapters_live_pair
  on public.school_chapters (school_id, chapter_id) where status in ('proposed', 'active');

create index if not exists idx_school_chapters_chapter_id
  on public.school_chapters (chapter_id);
create index if not exists idx_school_chapters_proposed_by
  on public.school_chapters (proposed_by);
create index if not exists idx_school_chapters_confirmed_by
  on public.school_chapters (confirmed_by);

alter table public.school_chapters enable row level security;

comment on table public.school_chapters is
  'A chapter''s school affiliation (school-layer.md § 2.4, minimal for #5929): proposed or active. An officer confirms; nothing writes active directly.';

-- 7. Slugs ------------------------------------------------------------------------

-- The two lookups the default slug makes for every school, indexed so the
-- seed of 1,281 schools doesn't scan the 13,327-row directory per school.
-- `chapter_directory` is written only by migrations, so the SHARE lock this
-- index build takes blocks nobody.
create index if not exists idx_chapter_directory_short_slug_part
  on public.chapter_directory (public.tenant_slug_part(university_short))
  where source <> 'retired';
create index if not exists idx_schools_short_slug_part
  on public.schools (public.tenant_slug_part(short_name));

-- The default slug before any collision number (at most 36 characters).
-- Reuses ADR-27's `tenant_slug_part` and `is_reserved_tenant_slug`.
create or replace function public.default_school_slug_base(p_school_id uuid)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_short text;
  v_short_schools integer;
  v_base text;
begin
  select public.tenant_slug_part(s.name), public.tenant_slug_part(s.short_name)
    into v_name, v_short
    from public.schools s
   where s.id = p_school_id;

  if v_short is not null and char_length(v_short) between 3 and 36
     and not public.is_reserved_tenant_slug(v_short) then
    -- How many directory schools carry this short name. A school seeded from
    -- the directory counts itself; one created by hand counts as one more.
    select count(distinct d.university)
      into v_short_schools
      from public.chapter_directory d
     where d.source <> 'retired'
       and public.tenant_slug_part(d.university_short) = v_short;
    if v_short_schools <= 1 and not exists (
      select 1 from public.schools o
       where o.id <> p_school_id
         and public.tenant_slug_part(o.short_name) = v_short
    ) then
      return v_short;
    end if;
  end if;

  v_base := trim(both '-' from left(coalesce(v_name, ''), 36));
  if char_length(v_base) < 3 then
    v_base := 'school';
  end if;
  return v_base;
end;
$$;

revoke all on function public.default_school_slug_base(uuid)
  from public, anon, authenticated;

-- Gives a school its default slug unless it already has a current one, and
-- returns the current slug either way.
create or replace function public.assign_default_school_slug(p_school_id uuid)
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
    from public.school_slugs
   where school_id = p_school_id and retired_at is null;
  if v_current is not null then
    return v_current;
  end if;

  v_base := public.default_school_slug_base(p_school_id);
  v_candidate := v_base;
  loop
    if not public.is_reserved_tenant_slug(v_candidate) then
      begin
        insert into public.school_slugs (slug, school_id)
        values (v_candidate, p_school_id);
        return v_candidate;
      exception when unique_violation then
        select slug into v_current
          from public.school_slugs
         where school_id = p_school_id and retired_at is null;
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

revoke all on function public.assign_default_school_slug(uuid)
  from public, anon, authenticated;

create or replace function public.schools_assign_school_slug()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assign_default_school_slug(new.id);
  return null;
end;
$$;

revoke all on function public.schools_assign_school_slug()
  from public, anon, authenticated;

drop trigger if exists schools_assign_school_slug on public.schools;
create trigger schools_assign_school_slug
  after insert on public.schools
  for each row execute function public.schools_assign_school_slug();

-- A slug belongs to one school for good: only `retired_at` may change, and
-- `school_id` only to the null a deleted school's foreign key writes.
create or replace function public.school_slugs_keep_owner()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.slug is distinct from old.slug then
    raise exception 'school_slugs: a slug is never renamed; retire it and insert a new one'
      using errcode = 'check_violation';
  end if;
  if new.school_id is distinct from old.school_id
     and new.school_id is not null then
    raise exception 'school_slugs: a slug never moves to another school'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.school_slugs_keep_owner()
  from public, anon, authenticated;

drop trigger if exists school_slugs_keep_owner on public.school_slugs;
create trigger school_slugs_keep_owner
  before update on public.school_slugs
  for each row execute function public.school_slugs_keep_owner();

-- 8. Seed from the directory ---------------------------------------------------------

-- One school per distinct `chapter_directory.university` (retired rows
-- aside) that has no school yet. Its short name is the directory's most
-- common `university_short` for it, and its aliases every short name and
-- alias the directory gives it. Schools are inserted in name order, so on a
-- slug tie the alphabetically first keeps the unnumbered slug. Idempotent: a
-- later directory migration can call it again. Returns how many it created.
create or replace function public.backfill_schools_from_directory()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_created integer;
begin
  with universities as (
    select d.university
      from public.chapter_directory d
     where d.source <> 'retired'
       and btrim(d.university) <> ''
     group by d.university
  ),
  short_names as (
    select distinct on (d.university)
           d.university, btrim(d.university_short) as short_name
      from public.chapter_directory d
     where d.source <> 'retired'
       and btrim(d.university_short) <> ''
     group by d.university, btrim(d.university_short)
     order by d.university, count(*) desc, btrim(d.university_short)
  ),
  aliases as (
    select x.university,
           array_agg(distinct x.alias order by x.alias) as aliases
      from (
        select d.university, btrim(d.university_short) as alias
          from public.chapter_directory d
         where d.source <> 'retired'
        union
        select d.university, btrim(a.alias)
          from public.chapter_directory d
          cross join lateral unnest(d.aliases) as a(alias)
         where d.source <> 'retired'
      ) x
     where x.alias <> '' and x.alias <> x.university
     group by x.university
  ),
  inserted as (
    insert into public.schools (name, short_name, aliases, directory_university)
    select u.university,
           coalesce(s.short_name, u.university),
           coalesce(a.aliases, '{}'),
           u.university
      from universities u
      left join short_names s on s.university = u.university
      left join aliases a on a.university = u.university
     where not exists (
       select 1 from public.schools e
        where e.directory_university = u.university
     )
     order by u.university
    returning 1
  )
  select count(*) into v_created from inserted;
  return v_created;
end;
$$;

revoke all on function public.backfill_schools_from_directory()
  from public, anon, authenticated;

select public.backfill_schools_from_directory();

-- 9. Domains -------------------------------------------------------------------

-- Verifies a school's domain, inserting it when the school doesn't propose it
-- yet. Refuses a domain that another school's verified domain equals,
-- contains, or (with its `include_subdomains`) reaches, and one whose own
-- `include_subdomains` would reach another school's. Runs under a lock on the
-- table so two verifications can't race. Returns the verified row's id.
create or replace function public.verify_school_domain(
  p_school_id          uuid,
  p_domain             text,
  p_include_subdomains boolean,
  p_verified_via       text,
  p_verified_by        uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_domain text := lower(btrim(p_domain));
  v_id uuid;
begin
  if p_verified_via not in ('edu_match', 'staff') then
    raise exception 'verify_school_domain: unknown verified_via %', p_verified_via
      using errcode = 'invalid_parameter_value';
  end if;

  lock table public.school_email_domains in share row exclusive mode;

  if exists (
    select 1
      from public.school_email_domains o
     where o.status = 'verified'
       and o.school_id <> p_school_id
       and (
         o.domain = v_domain
         or (o.include_subdomains and v_domain like '%.' || o.domain)
         or (p_include_subdomains and o.domain like '%.' || v_domain)
       )
  ) then
    raise exception 'verify_school_domain: % overlaps another school''s verified domain', v_domain
      using errcode = 'unique_violation';
  end if;

  select id into v_id
    from public.school_email_domains
   where school_id = p_school_id and domain = v_domain
   order by created_at
   limit 1;

  if v_id is null then
    insert into public.school_email_domains (
      school_id, domain, include_subdomains, status,
      verified_via, verified_by, verified_at
    ) values (
      p_school_id, v_domain, p_include_subdomains, 'verified',
      p_verified_via, p_verified_by, now()
    )
    returning id into v_id;
  else
    update public.school_email_domains
       set status = 'verified',
           include_subdomains = p_include_subdomains,
           verified_via = p_verified_via,
           verified_by = p_verified_by,
           verified_at = now()
     where id = v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.verify_school_domain(uuid, text, boolean, text, uuid)
  from public, anon, authenticated;
grant execute on function public.verify_school_domain(uuid, text, boolean, text, uuid)
  to service_role;

-- Whether an address's domain is one of the school's verified domains.
create or replace function public.school_accepts_email_domain(
  p_school_id uuid,
  p_domain    text
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.school_email_domains d
     where d.school_id = p_school_id
       and d.status = 'verified'
       and (
         d.domain = lower(p_domain)
         or (d.include_subdomains and lower(p_domain) like '%.' || d.domain)
       )
  );
$$;

revoke all on function public.school_accepts_email_domain(uuid, text)
  from public, anon, authenticated;

-- School search for the onboarding step: by name, short name or alias, best
-- match first (a short name or alias equal to the query, then a name that
-- starts with it, then any that contain it). Suspended schools are left out.
-- `verifiable` says whether a student can verify there today, and
-- `email_domains` lists its verified domains, which are public anyway (they
-- are the school's own mail hosts).
create or replace function public.search_schools(p_query text, p_limit integer)
returns table (
  id uuid,
  name text,
  short_name text,
  slug text,
  verifiable boolean,
  email_domains text[]
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with q as (
    select lower(btrim(p_query)) as text
  ),
  matched as (
    select s.*,
           case
             when lower(s.short_name) = q.text
               or exists (select 1 from unnest(s.aliases) a where lower(a) = q.text)
               then 0
             when lower(s.name) like q.text || '%' then 1
             when lower(s.name) like '%' || q.text || '%' then 2
             when lower(s.short_name) like q.text || '%' then 2
             else 3
           end as rank
      from public.schools s, q
     where s.status <> 'suspended'
       and char_length(q.text) >= 2
       and (
         lower(s.name) like '%' || q.text || '%'
         or lower(s.short_name) like q.text || '%'
         or exists (select 1 from unnest(s.aliases) a where lower(a) like q.text || '%')
       )
  )
  select m.id,
         m.name,
         m.short_name,
         ss.slug,
         (m.status = 'verified' and coalesce(array_length(d.domains, 1), 0) > 0),
         coalesce(d.domains, '{}')
    from matched m
    left join public.school_slugs ss
      on ss.school_id = m.id and ss.retired_at is null
    left join lateral (
      select array_agg(e.domain order by e.domain) as domains
        from public.school_email_domains e
       where e.school_id = m.id and e.status = 'verified'
    ) d on true
   order by m.rank, m.name
   limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.search_schools(text, integer)
  from public, anon, authenticated;
grant execute on function public.search_schools(text, integer)
  to service_role;

-- 10. Verification codes -----------------------------------------------------------

-- Opens a verification for an account at a school, counting earlier ones under
-- advisory locks on the address, the IP and the account, so requests sent at
-- once can't pass a ceiling between them. The limits come from the API
-- (`school-verification.ts`), which is their one source. It closes the
-- account's earlier open code for the school, and deletes every row older than
-- a day. Returns `{ ok, reason, id, expires_at, retry_after_seconds }`, where
-- reason is one of `school_not_verifiable`, `wrong_domain`, `cooldown`,
-- `address_limit`, `ip_limit`, `account_limit`.
create or replace function public.start_school_email_verification(
  p_user_id          uuid,
  p_school_id        uuid,
  p_email            text,
  p_code_salt        text,
  p_code_hash        text,
  p_ip_hash          text,
  p_ttl_seconds      integer,
  p_window_seconds   integer,
  p_max_per_address  integer,
  p_max_per_ip       integer,
  p_max_per_account  integer,
  p_cooldown_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(p_email));
  v_domain text := public.school_email_domain(p_email);
  v_key text := public.school_email_key(p_email);
  v_since timestamptz := now() - make_interval(secs => p_window_seconds);
  v_last timestamptz;
  v_oldest timestamptz;
  v_count integer;
  v_id uuid;
  v_expires timestamptz;
begin
  if not exists (
    select 1 from public.schools s
     where s.id = p_school_id and s.status = 'verified'
  ) or not exists (
    select 1 from public.school_email_domains d
     where d.school_id = p_school_id and d.status = 'verified'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'school_not_verifiable');
  end if;

  if v_domain = '' or not public.school_accepts_email_domain(p_school_id, v_domain) then
    return jsonb_build_object('ok', false, 'reason', 'wrong_domain');
  end if;

  -- Fixed order: address, IP, account.
  perform pg_advisory_xact_lock(hashtextextended('school_email_code:addr:' || v_key, 0));
  if p_ip_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended('school_email_code:ip:' || p_ip_hash, 0));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('school_email_code:user:' || p_user_id::text, 0));

  delete from public.school_email_verifications
   where created_at < now() - interval '1 day';

  select max(created_at) into v_last
    from public.school_email_verifications
   where user_id = p_user_id and school_id = p_school_id;
  if v_last is not null
     and v_last > now() - make_interval(secs => p_cooldown_seconds) then
    return jsonb_build_object(
      'ok', false, 'reason', 'cooldown',
      'retry_after_seconds',
      ceil(extract(epoch from (v_last + make_interval(secs => p_cooldown_seconds) - now())))::integer
    );
  end if;

  select count(*), min(created_at) into v_count, v_oldest
    from public.school_email_verifications
   where public.school_email_key(email) = v_key and created_at > v_since;
  if v_count >= p_max_per_address then
    return jsonb_build_object(
      'ok', false, 'reason', 'address_limit',
      'retry_after_seconds',
      greatest(1, ceil(extract(epoch from (v_oldest + make_interval(secs => p_window_seconds) - now())))::integer)
    );
  end if;

  if p_ip_hash is not null then
    select count(*), min(created_at) into v_count, v_oldest
      from public.school_email_verifications
     where ip_hash = p_ip_hash and created_at > v_since;
    if v_count >= p_max_per_ip then
      return jsonb_build_object(
        'ok', false, 'reason', 'ip_limit',
        'retry_after_seconds',
        greatest(1, ceil(extract(epoch from (v_oldest + make_interval(secs => p_window_seconds) - now())))::integer)
      );
    end if;
  end if;

  select count(*), min(created_at) into v_count, v_oldest
    from public.school_email_verifications
   where user_id = p_user_id and created_at > v_since;
  if v_count >= p_max_per_account then
    return jsonb_build_object(
      'ok', false, 'reason', 'account_limit',
      'retry_after_seconds',
      greatest(1, ceil(extract(epoch from (v_oldest + make_interval(secs => p_window_seconds) - now())))::integer)
    );
  end if;

  -- Earlier open codes stay open: the API checks only the newest, and
  -- deletes this row if its email doesn't go out, so a failed send leaves
  -- the code already in the member's inbox working. A match closes them all.
  v_expires := now() + make_interval(secs => p_ttl_seconds);
  insert into public.school_email_verifications (
    user_id, school_id, email, code_salt, code_hash, ip_hash, expires_at
  ) values (
    p_user_id, p_school_id, v_email, p_code_salt, p_code_hash, p_ip_hash, v_expires
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'expires_at', v_expires);
end;
$$;

revoke all on function public.start_school_email_verification(
  uuid, uuid, text, text, text, text, integer, integer, integer, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.start_school_email_verification(
  uuid, uuid, text, text, text, text, integer, integer, integer, integer, integer, integer
) to service_role;

-- Checks a code against the account's open verification at a school, and on
-- a match writes (or renews) the `school_members` row in the same
-- transaction. The API hashes the typed code with the row's salt and passes
-- the verification it read, which this function locks and rechecks: still
-- the account's, the school's, open and unexpired. Returns
-- `{ ok, reason, attempts_left, member_id }`, where reason is one of
-- `no_code`, `expired`, `too_many_attempts`, `wrong_code`, `address_taken`,
-- `school_not_verifiable`.
create or replace function public.confirm_school_email_verification(
  p_user_id         uuid,
  p_school_id       uuid,
  p_verification_id uuid,
  p_code_hash       text,
  p_max_attempts    integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.school_email_verifications;
  v_member_id uuid;
begin
  select * into v_row
    from public.school_email_verifications
   where id = p_verification_id
     and user_id = p_user_id
     and school_id = p_school_id
   for update;

  if not found or v_row.closed_at is not null then
    if found and v_row.outcome = 'exhausted' then
      return jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'no_code');
  end if;

  if v_row.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  if v_row.attempts >= p_max_attempts then
    update public.school_email_verifications
       set closed_at = now(), outcome = 'exhausted'
     where id = v_row.id;
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  end if;

  if v_row.code_hash is distinct from p_code_hash then
    update public.school_email_verifications
       set attempts = attempts + 1,
           closed_at = case when attempts + 1 >= p_max_attempts then now() end,
           outcome = case when attempts + 1 >= p_max_attempts then 'exhausted' end
     where id = v_row.id;
    if v_row.attempts + 1 >= p_max_attempts then
      return jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
    end if;
    return jsonb_build_object(
      'ok', false, 'reason', 'wrong_code',
      'attempts_left', p_max_attempts - v_row.attempts - 1
    );
  end if;

  -- The school or its domain may have changed since the code went out.
  if not exists (
    select 1 from public.schools s
     where s.id = p_school_id and s.status = 'verified'
  ) or not public.school_accepts_email_domain(
    p_school_id, public.school_email_domain(v_row.email)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'school_not_verifiable');
  end if;

  -- One school address proves one account. Checked only after the code
  -- matched, so only the address's holder learns it is taken, and under a
  -- lock on the school and mailbox, so two accounts confirming the same
  -- address at once can't both pass and meet the unique index.
  perform pg_advisory_xact_lock(hashtextextended(
    'school_email_member:' || p_school_id::text || ':' || public.school_email_key(v_row.email), 0));
  if exists (
    select 1 from public.school_members m
     where m.school_id = p_school_id
       and public.school_email_key(m.verified_email) = public.school_email_key(v_row.email)
       and m.user_id <> p_user_id
  ) then
    update public.school_email_verifications
       set closed_at = now(), outcome = 'superseded'
     where id = v_row.id;
    return jsonb_build_object('ok', false, 'reason', 'address_taken');
  end if;

  insert into public.school_members as m (
    school_id, user_id, status, verified_via, verified_email, verified_at
  ) values (
    p_school_id, p_user_id, 'member', 'email_code', v_row.email, now()
  )
  on conflict (school_id, user_id) do update
     set verified_via = 'email_code',
         verified_email = excluded.verified_email,
         verified_at = excluded.verified_at,
         left_at = null,
         -- A PNM or alum who proves the address again keeps that status.
         status = m.status
  returning m.id into v_member_id;

  update public.school_email_verifications
     set closed_at = now(), outcome = 'verified'
   where id = v_row.id;
  update public.school_email_verifications
     set closed_at = now(), outcome = 'superseded'
   where user_id = p_user_id and school_id = p_school_id and closed_at is null;

  return jsonb_build_object('ok', true, 'member_id', v_member_id);
end;
$$;

revoke all on function public.confirm_school_email_verification(uuid, uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.confirm_school_email_verification(uuid, uuid, uuid, text, integer)
  to service_role;

-- Deletes a code whose email didn't go out, so it neither counts toward the
-- ceilings nor hides the account's earlier, still-working code.
create or replace function public.discard_school_email_verification(
  p_user_id uuid,
  p_verification_id uuid
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.school_email_verifications
   where id = p_verification_id and user_id = p_user_id and closed_at is null;
$$;

revoke all on function public.discard_school_email_verification(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.discard_school_email_verification(uuid, uuid)
  to service_role;

-- 11. Account deletion -------------------------------------------------------------

-- `anonymize_user` tombstones the `users` row in place, so the cascades above
-- never fire (school-layer.md § 3.5). This trigger deletes the person's
-- school rows when the tombstone is written, whichever path writes it.
create or replace function public.users_drop_school_rows()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.school_members where user_id = new.id;
  delete from public.school_email_verifications where user_id = new.id;
  return null;
end;
$$;

revoke all on function public.users_drop_school_rows()
  from public, anon, authenticated;

drop trigger if exists users_drop_school_rows on public.users;
create trigger users_drop_school_rows
  after update of deleted_at on public.users
  for each row
  when (new.deleted_at is not null)
  execute function public.users_drop_school_rows();
