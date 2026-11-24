-- Chapter interest forms (#5977, MVP step 3 of #5833).
-- `spec/behavior/ifc-recruitment.md` § Chapter interest forms and § The
-- council master list; `spec/architecture/school-layer.md` § 2.5; ADR-27's
-- `/f/<form-slug>` rules.
--
-- 1. `rush_candidates`: a candidate a PNM's own form created has no member
--    who added it, so `created_by` is required only of a hand-added row
--    (`origin = 'manual'`). The name rule covers hand-added rows only
--    (§ 2.5 "The name rule"): two different PNMs may share a name.
-- 2. `chapter_interest_forms`: one live form per chapter, at its own slug
--    (a printed QR code survives a chapter rename; a replaced form gets a
--    new slug and the old one stops answering). Created closed.
-- 3. `chapter_interest_form_labels`: the QR source labels.
-- 4. `interest_form_verifications`: the form's one-time codes. #5929's
--    `school_email_verifications` needs an account; a PNM on the form has
--    none, so the form has its own table with the same hashing, ceilings
--    and attempt count, keyed on the form instead of an account. A matched
--    code mints a short-lived proof the submission spends once.
-- 5. `interest_form_submissions`: every submission, with the consent
--    record (text version, boxes ticked, time, source label) and the
--    chapter's own answers. Chapter-private: no push-up reads it.
-- 6. Functions, security definer, service role only, `search_path` pinned:
--    `start_interest_form_code`, `confirm_interest_form_code`,
--    `submit_interest_form` (the whole submission in one transaction) and
--    `push_up_chapter_form_interests` (a chapter's form PNMs join its
--    council's master list once the link is accepted), and
--    `replace_interest_form`.
--
-- Posture: RLS on with no policies on every new table, as every rush table;
-- the API reaches them through the service role. The public page reads a
-- form's public fields through the API, never the table.
--
-- Locks. `rush_candidates` is small: dropping NOT NULL is catalog-only, the
-- new check is added `not valid` then validated, and the partial name index
-- is built before the old one is dropped, so the rule never lapses.

-- 1. rush_candidates ---------------------------------------------------------------

alter table public.rush_candidates
  alter column created_by drop not null;

alter table public.rush_candidates
  drop constraint if exists rush_candidates_created_by_manual;
alter table public.rush_candidates
  add constraint rush_candidates_created_by_manual
  check (origin = 'pnm' or created_by is not null) not valid;
alter table public.rush_candidates
  validate constraint rush_candidates_created_by_manual;

comment on column public.rush_candidates.created_by is
  'The member who added the prospect by hand. Null only for a candidate the PNM''s own interest form created (origin = pnm, #5977).';

create unique index if not exists rush_candidates_chapter_manual_name_key
  on public.rush_candidates (chapter_id, name_key) where origin = 'manual';
drop index if exists public.rush_candidates_chapter_name_key;

-- 2. chapter_interest_forms --------------------------------------------------------

create table if not exists public.chapter_interest_forms (
  id                uuid primary key default gen_random_uuid(),
  chapter_id        uuid not null references public.chapters(id) on delete cascade,
  slug              text not null
                    constraint chapter_interest_forms_slug_shape
                    check (slug ~ '^[a-z0-9]{8,32}$'),
  is_open           boolean not null default false,
  blurb             text
                    constraint chapter_interest_forms_blurb_len
                    check (blurb is null or char_length(btrim(blurb)) between 1 and 500),
  questions         jsonb not null default '[]'::jsonb
                    constraint chapter_interest_forms_questions_shape
                    check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) <= 10),
  ask_referrer      boolean not null default true,
  contacts_group_id uuid references public.chapter_groups(id) on delete set null,
  replaced_at       timestamptz,
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- A slug is never reused, so an old QR code never opens someone else's form.
create unique index if not exists chapter_interest_forms_slug_key
  on public.chapter_interest_forms (slug);
create unique index if not exists chapter_interest_forms_one_live
  on public.chapter_interest_forms (chapter_id) where replaced_at is null;
create index if not exists idx_chapter_interest_forms_contacts_group_id
  on public.chapter_interest_forms (contacts_group_id) where contacts_group_id is not null;
create index if not exists idx_chapter_interest_forms_created_by
  on public.chapter_interest_forms (created_by) where created_by is not null;

alter table public.chapter_interest_forms enable row level security;

comment on table public.chapter_interest_forms is
  'A chapter''s interest form at /f/<slug> (ifc-recruitment.md § Chapter interest forms, ADR-27). One live row per chapter; replacing it stamps replaced_at and issues a new slug. Created closed; rush:manage opens it. contacts_group_id is the recruitment contacts Group told of each submission beside rush:manage.';

-- 3. chapter_interest_form_labels -------------------------------------------------

create table if not exists public.chapter_interest_form_labels (
  id         uuid primary key default gen_random_uuid(),
  form_id    uuid not null references public.chapter_interest_forms(id) on delete cascade,
  label      text not null
             constraint chapter_interest_form_labels_shape
             check (label ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  created_at timestamptz not null default now(),
  unique (form_id, label)
);

alter table public.chapter_interest_form_labels enable row level security;

comment on table public.chapter_interest_form_labels is
  'A form''s QR source labels (tabling-quad): each gets its own QR code, and the label is recorded on the interest and the submission.';

-- 4. interest_form_verifications --------------------------------------------------

create table if not exists public.interest_form_verifications (
  id               uuid primary key default gen_random_uuid(),
  form_id          uuid not null references public.chapter_interest_forms(id) on delete cascade,
  email            text not null,
  code_salt        text not null,
  code_hash        text not null,
  ip_hash          text,
  attempts         integer not null default 0
                   constraint interest_form_verifications_attempts_check check (attempts >= 0),
  expires_at       timestamptz not null,
  closed_at        timestamptz,
  outcome          text
                   constraint interest_form_verifications_outcome_check
                   check (outcome in ('verified', 'superseded', 'exhausted', 'used')),
  proof_hash       text,
  proof_expires_at timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists idx_interest_form_verifications_form_email
  on public.interest_form_verifications (form_id, lower(email), created_at desc);
create index if not exists idx_interest_form_verifications_email
  on public.interest_form_verifications (lower(email), created_at);
create index if not exists idx_interest_form_verifications_ip
  on public.interest_form_verifications (ip_hash, created_at);
create index if not exists idx_interest_form_verifications_created_at
  on public.interest_form_verifications (created_at);

alter table public.interest_form_verifications enable row level security;

comment on table public.interest_form_verifications is
  'The interest form''s one-time codes (ifc-recruitment.md § Identity and duplicates, verify first). Stores salted hashes of the code and of the proof a match mints, never either value; rows older than a day go when the next code is asked for.';

-- 5. interest_form_submissions ----------------------------------------------------

create table if not exists public.interest_form_submissions (
  id                     uuid primary key default gen_random_uuid(),
  form_id                uuid not null references public.chapter_interest_forms(id) on delete cascade,
  chapter_id             uuid not null references public.chapters(id) on delete cascade,
  pnm_id                 uuid references public.pnms(id) on delete cascade,
  candidate_id           uuid references public.rush_candidates(id) on delete set null,
  email                  text not null
                         constraint interest_form_submissions_email_lower
                         check (email = lower(btrim(email))),
  first_name             text not null,
  last_name              text not null,
  preferred_name         text,
  class_year             smallint,
  phone                  text,
  answers                jsonb not null default '{}'::jsonb
                         constraint interest_form_submissions_answers_shape
                         check (jsonb_typeof(answers) = 'object'),
  questions              jsonb not null default '[]'::jsonb
                         constraint interest_form_submissions_questions_shape
                         check (jsonb_typeof(questions) = 'array'),
  referrer_text          text
                         constraint interest_form_submissions_referrer_len
                         check (referrer_text is null or char_length(referrer_text) between 1 and 200),
  referrer_user_id       uuid references public.users(id) on delete set null,
  link_candidate_id      uuid references public.rush_candidates(id) on delete set null,
  source_label           text,
  consent_version        text not null,
  consent_boxes          text[] not null,
  consented_at           timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  constraint interest_form_submissions_names_len check (
    char_length(btrim(first_name)) between 1 and 100
    and char_length(btrim(last_name)) between 1 and 100
    and (preferred_name is null or char_length(btrim(preferred_name)) between 1 and 100)
  ),
  constraint interest_form_submissions_class_year_range
    check (class_year is null or class_year between 1900 and 2200),
  constraint interest_form_submissions_phone_len
    check (phone is null or char_length(phone) between 7 and 32),
  constraint interest_form_submissions_agreed
    check ('agree_18' = any (consent_boxes))
);

create index if not exists idx_interest_form_submissions_chapter_email
  on public.interest_form_submissions (chapter_id, email, created_at desc);
create index if not exists idx_interest_form_submissions_candidate_id
  on public.interest_form_submissions (candidate_id, created_at desc) where candidate_id is not null;
create index if not exists idx_interest_form_submissions_pnm_id
  on public.interest_form_submissions (pnm_id) where pnm_id is not null;
create index if not exists idx_interest_form_submissions_form_id
  on public.interest_form_submissions (form_id);
create index if not exists idx_interest_form_submissions_referrer_user_id
  on public.interest_form_submissions (referrer_user_id) where referrer_user_id is not null;
create index if not exists idx_interest_form_submissions_link_candidate_id
  on public.interest_form_submissions (link_candidate_id) where link_candidate_id is not null;

alter table public.interest_form_submissions enable row level security;

comment on table public.interest_form_submissions is
  'Every interest-form submission, with its consent record: the text version, the boxes ticked, the time and the source label (ifc-recruitment.md § Consent and privacy text). The chapter''s own questions and answers are chapter-private and never pushed up. Goes with the PNM record (on delete cascade). link_candidate_id is a hand-added candidate of the same name the chapter is asked to link; referrer_user_id the member the "Who referred you?" text names, for the chapter to confirm.';

-- 6. Functions -------------------------------------------------------------------

-- The live form a slug names, with its chapter, if the chapter may take
-- interest at all: a chapter (not a council), not NPHC, Rush module on.
create or replace function public.interest_form_chapter_ok(p_chapter_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.chapters c
     where c.id = p_chapter_id
       and c.kind = 'chapter'
       and c.org_archetype is distinct from 'nphc'
       and coalesce(c.enabled_modules ->> 'rush', 'true') <> 'false'
  );
$$;

revoke all on function public.interest_form_chapter_ok(uuid) from public, anon, authenticated;

-- The school an address proves for the chapter: the chapter's active school
-- whose verified domains take it. Null for a chapter with no school, and
-- null too for an address no school of the chapter takes (the caller tells
-- the two apart with `interest_form_has_school`).
create or replace function public.interest_form_school_for(p_chapter_id uuid, p_email text)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select sc.school_id
    from public.school_chapters sc
    join public.schools s on s.id = sc.school_id
   where sc.chapter_id = p_chapter_id
     and sc.status = 'active'
     and s.status = 'verified'
     and public.school_accepts_email_domain(sc.school_id, public.school_email_domain(p_email))
   order by sc.created_at
   limit 1;
$$;

revoke all on function public.interest_form_school_for(uuid, text) from public, anon, authenticated;

create or replace function public.interest_form_has_school(p_chapter_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.school_chapters sc
     where sc.chapter_id = p_chapter_id and sc.status = 'active'
  );
$$;

revoke all on function public.interest_form_has_school(uuid) from public, anon, authenticated;

-- Sends nothing: records a code the API is about to email, under the form's
-- ceilings. Refuses a closed or replaced form, a chapter that takes no
-- interest, an address its school doesn't take, and each ceiling: a resend
-- cooldown per form and address, then per address and per IP over the
-- window, counted under locks so they hold across API replicas. Reasons:
-- `form_closed`, `wrong_domain`, `school_not_verifiable`, `cooldown`,
-- `address_limit`, `ip_limit`.
create or replace function public.start_interest_form_code(
  p_form_id          uuid,
  p_email            text,
  p_code_salt        text,
  p_code_hash        text,
  p_ip_hash          text,
  p_ttl_seconds      integer,
  p_window_seconds   integer,
  p_max_per_address  integer,
  p_max_per_ip       integer,
  p_cooldown_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(p_email));
  v_form public.chapter_interest_forms;
  v_since timestamptz := now() - make_interval(secs => p_window_seconds);
  v_last timestamptz;
  v_oldest timestamptz;
  v_count integer;
  v_id uuid;
  v_expires timestamptz;
begin
  select * into v_form from public.chapter_interest_forms where id = p_form_id;
  if v_form.id is null or v_form.replaced_at is not null or not v_form.is_open
     or not public.interest_form_chapter_ok(v_form.chapter_id) then
    return jsonb_build_object('ok', false, 'reason', 'form_closed');
  end if;

  if public.interest_form_has_school(v_form.chapter_id)
     and public.interest_form_school_for(v_form.chapter_id, v_email) is null then
    if not exists (
      select 1 from public.school_chapters sc
        join public.schools s on s.id = sc.school_id
       where sc.chapter_id = v_form.chapter_id and sc.status = 'active'
         and s.status = 'verified'
         and exists (select 1 from public.school_email_domains d
                      where d.school_id = s.id and d.status = 'verified')
    ) then
      return jsonb_build_object('ok', false, 'reason', 'school_not_verifiable');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'wrong_domain');
  end if;

  -- Fixed order: address, then IP.
  perform pg_advisory_xact_lock(hashtextextended('interest_form_code:addr:' || v_email, 0));
  if p_ip_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended('interest_form_code:ip:' || p_ip_hash, 0));
  end if;

  delete from public.interest_form_verifications
   where created_at < now() - interval '1 day';

  select max(created_at) into v_last
    from public.interest_form_verifications
   where form_id = p_form_id and lower(email) = v_email;
  if v_last is not null and v_last > now() - make_interval(secs => p_cooldown_seconds) then
    return jsonb_build_object(
      'ok', false, 'reason', 'cooldown',
      'retry_after_seconds',
      ceil(extract(epoch from (v_last + make_interval(secs => p_cooldown_seconds) - now())))::integer
    );
  end if;

  select count(*), min(created_at) into v_count, v_oldest
    from public.interest_form_verifications
   where lower(email) = v_email and created_at > v_since;
  if v_count >= p_max_per_address then
    return jsonb_build_object(
      'ok', false, 'reason', 'address_limit',
      'retry_after_seconds',
      greatest(1, ceil(extract(epoch from (v_oldest + make_interval(secs => p_window_seconds) - now())))::integer)
    );
  end if;

  if p_ip_hash is not null then
    select count(*), min(created_at) into v_count, v_oldest
      from public.interest_form_verifications
     where ip_hash = p_ip_hash and created_at > v_since;
    if v_count >= p_max_per_ip then
      return jsonb_build_object(
        'ok', false, 'reason', 'ip_limit',
        'retry_after_seconds',
        greatest(1, ceil(extract(epoch from (v_oldest + make_interval(secs => p_window_seconds) - now())))::integer)
      );
    end if;
  end if;

  v_expires := now() + make_interval(secs => p_ttl_seconds);
  insert into public.interest_form_verifications (
    form_id, email, code_salt, code_hash, ip_hash, expires_at
  ) values (
    p_form_id, v_email, p_code_salt, p_code_hash, p_ip_hash, v_expires
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'expires_at', v_expires);
end;
$$;

revoke all on function public.start_interest_form_code(
  uuid, text, text, text, text, integer, integer, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.start_interest_form_code(
  uuid, text, text, text, text, integer, integer, integer, integer, integer
) to service_role;

-- Checks a typed code against the address's newest code on the form. On a
-- match it stores the hash of a proof the API minted, good for
-- `p_proof_ttl_seconds`, which the submission spends. Reasons: `no_code`,
-- `expired`, `too_many_attempts`, `wrong_code` (with `attempts_left`).
create or replace function public.confirm_interest_form_code(
  p_form_id           uuid,
  p_verification_id   uuid,
  p_code_hash         text,
  p_proof_hash        text,
  p_proof_ttl_seconds integer,
  p_max_attempts      integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.interest_form_verifications;
begin
  select * into v_row
    from public.interest_form_verifications
   where id = p_verification_id and form_id = p_form_id
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
    update public.interest_form_verifications
       set closed_at = now(), outcome = 'exhausted'
     where id = v_row.id;
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  end if;

  if v_row.code_hash is distinct from p_code_hash then
    update public.interest_form_verifications
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

  update public.interest_form_verifications
     set closed_at = now(), outcome = 'verified',
         proof_hash = p_proof_hash,
         proof_expires_at = now() + make_interval(secs => p_proof_ttl_seconds)
   where id = v_row.id;
  -- Older open codes for the address on this form stop working.
  update public.interest_form_verifications
     set closed_at = now(), outcome = 'superseded'
   where form_id = p_form_id and lower(email) = lower(v_row.email)
     and closed_at is null and id <> v_row.id;

  return jsonb_build_object('ok', true, 'email', v_row.email);
end;
$$;

revoke all on function public.confirm_interest_form_code(uuid, uuid, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.confirm_interest_form_code(uuid, uuid, text, text, integer, integer)
  to service_role;

-- The chapter's council link that takes push-ups now: accepted, at the
-- school, a verified council that recruits, with a season open. Null
-- otherwise, and then the form feeds only the chapter (§ Before the
-- chapter's council link is accepted).
create or replace function public.interest_form_push_target(p_chapter_id uuid, p_school_id uuid)
returns table (council_id uuid, term text)
language sql
stable
set search_path = public, pg_temp
as $$
  select c.id, s.term
    from public.council_chapters cc
    join public.chapters c on c.id = cc.council_id
    join public.council_recruitment_seasons s on s.council_id = c.id and s.status = 'open'
   where cc.chapter_id = p_chapter_id
     and cc.status = 'accepted'
     and c.kind = 'council'
     and c.council_school_id = p_school_id
     and c.council_verified_at is not null
     and c.recruitment_model is distinct from 'none'
   order by s.opens_at desc
   limit 1;
$$;

revoke all on function public.interest_form_push_target(uuid, uuid) from public, anon, authenticated;

-- The whole submission, in one transaction (ifc-recruitment.md § What a
-- submission does):
--   1. spends the proof a matched code minted (once, unexpired, this form's);
--   2. finds or creates the PNM: at a school through `upsert_verified_pnm`
--      (the identity rules); with no school there is no school-wide record,
--      and the chapter's own submissions are the match (§ Chapters with no
--      school). It never sets `pnms.phone_shared`: a phone given on one
--      chapter's form is that chapter's (on the submission), never shared
--      with every chapter the PNM is linked to;
--   3. adds or refreshes the interest (`record_pnm_interest`), pushed up to
--      the council when `interest_form_push_target` names one;
--   4. creates the chapter's candidate in its first stage with `pnm_id`, or
--      updates the one it has: a repeat submission never duplicates. A
--      candidate this address made before the chapter joined a school is
--      linked to the school record now;
--   5. records the submission with its consent, a hand-added candidate of
--      the same name for the chapter to confirm, and the member the
--      referrer text names, when exactly one does.
-- Telling the chapter is the API's, after this commits. Reasons:
-- `bad_proof`, `form_closed`, `wrong_domain`, and `record_pnm_interest`'s.
create or replace function public.submit_interest_form(
  p_form_id         uuid,
  p_verification_id uuid,
  p_proof_hash      text,
  p_first_name      text,
  p_last_name       text,
  p_preferred_name  text,
  p_class_year      smallint,
  p_phone           text,
  p_answers         jsonb,
  p_referrer_text   text,
  p_source_label    text,
  p_consent_version text,
  p_consent_boxes   text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ver public.interest_form_verifications;
  v_form public.chapter_interest_forms;
  v_email text;
  v_school_id uuid;
  v_pnm_id uuid;
  v_result jsonb;
  v_target record;
  v_council_id uuid;
  v_pushed boolean := false;
  v_label text;
  v_candidate_id uuid;
  v_candidate_created boolean := false;
  v_stage text;
  v_name text;
  v_link_id uuid;
  v_referrer_id uuid;
  v_submission_id uuid;
begin
  select * into v_ver
    from public.interest_form_verifications
   where id = p_verification_id and form_id = p_form_id
   for update;
  if v_ver.id is null or v_ver.outcome is distinct from 'verified'
     or v_ver.proof_hash is distinct from p_proof_hash
     or v_ver.proof_expires_at is null or v_ver.proof_expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'bad_proof');
  end if;
  v_email := lower(btrim(v_ver.email));

  select * into v_form from public.chapter_interest_forms where id = p_form_id for share;
  if v_form.id is null or v_form.replaced_at is not null or not v_form.is_open
     or not public.interest_form_chapter_ok(v_form.chapter_id) then
    return jsonb_build_object('ok', false, 'reason', 'form_closed');
  end if;

  -- A label the form no longer has is recorded as none, not refused: the
  -- QR code was printed, and the person is still interested.
  select l.label into v_label
    from public.chapter_interest_form_labels l
   where l.form_id = p_form_id and l.label = lower(btrim(p_source_label));

  v_name := coalesce(nullif(btrim(p_preferred_name), ''), btrim(p_first_name))
            || ' ' || btrim(p_last_name);

  v_school_id := public.interest_form_school_for(v_form.chapter_id, v_email);
  if v_school_id is null and public.interest_form_has_school(v_form.chapter_id) then
    return jsonb_build_object('ok', false, 'reason', 'wrong_domain');
  end if;

  if v_school_id is not null then
    v_result := public.upsert_verified_pnm(
      v_school_id, v_email, p_first_name, p_last_name, p_preferred_name,
      p_class_year, p_phone, null, 'interest_form', null
    );
    if not (v_result ->> 'ok')::boolean then
      return v_result;
    end if;
    v_pnm_id := (v_result ->> 'pnm_id')::uuid;

    select * into v_target from public.interest_form_push_target(v_form.chapter_id, v_school_id);
    if v_target.council_id is not null then
      v_result := public.record_pnm_interest(
        v_pnm_id, v_form.chapter_id, 'interest_form', v_label, v_target.council_id, v_target.term
      );
      v_pushed := (v_result ->> 'ok')::boolean;
      if v_pushed then
        v_council_id := v_target.council_id;
      end if;
    end if;
    if not v_pushed then
      v_result := public.record_pnm_interest(
        v_pnm_id, v_form.chapter_id, 'interest_form', v_label, null, null
      );
      if not (v_result ->> 'ok')::boolean then
        return v_result;
      end if;
    end if;
    v_pnm_id := (v_result ->> 'pnm_id')::uuid;
    update public.pnm_interests
       set source_label = coalesce(v_label, source_label)
     where id = (v_result ->> 'interest_id')::uuid;

    select id into v_candidate_id
      from public.rush_candidates
     where chapter_id = v_form.chapter_id and pnm_id = v_pnm_id
     for update;
  end if;

  -- This address's earlier form candidate at the chapter: before the
  -- chapter joined a school, or a school record since deleted.
  if v_candidate_id is null then
    select rc.id into v_candidate_id
      from public.interest_form_submissions s
      join public.rush_candidates rc on rc.id = s.candidate_id
     where s.chapter_id = v_form.chapter_id
       and s.email = v_email
       and rc.origin = 'pnm'
       and rc.pnm_id is null
     order by s.created_at desc
     limit 1
     for update of rc;
  end if;

  if v_candidate_id is null then
    select key into v_stage
      from public.rush_stages
     where chapter_id = v_form.chapter_id and category = 'new' and not hidden
     order by position
     limit 1;
    insert into public.rush_candidates (chapter_id, display_name, stage, origin, pnm_id, created_by)
    values (v_form.chapter_id, left(v_name, 200), coalesce(v_stage, 'new'), 'pnm', v_pnm_id, null)
    returning id into v_candidate_id;
    v_candidate_created := true;

    -- A hand-added candidate with the name: the chapter confirms a link
    -- (rush:add); it never links on its own.
    select id into v_link_id
      from public.rush_candidates
     where chapter_id = v_form.chapter_id and origin = 'manual' and pnm_id is null
       and name_key = lower(trim(left(v_name, 200)))
     limit 1;
  else
    update public.rush_candidates
       set display_name = left(v_name, 200),
           pnm_id = coalesce(pnm_id, v_pnm_id)
     where id = v_candidate_id;
  end if;

  -- The member the referrer text names, when exactly one does.
  if nullif(btrim(p_referrer_text), '') is not null then
    select min(m.user_id::text)::uuid into v_referrer_id
      from public.members m
      join public.users u on u.id = m.user_id
     where m.chapter_id = v_form.chapter_id
       and lower(btrim(u.display_name)) = lower(btrim(p_referrer_text))
    having count(*) = 1;
  end if;

  update public.interest_form_verifications
     set outcome = 'used', proof_hash = null
   where id = v_ver.id;

  insert into public.interest_form_submissions (
    form_id, chapter_id, pnm_id, candidate_id, email, first_name, last_name,
    preferred_name, class_year, phone, answers, questions, referrer_text, referrer_user_id,
    link_candidate_id, source_label, consent_version, consent_boxes
  ) values (
    p_form_id, v_form.chapter_id, v_pnm_id, v_candidate_id, v_email, btrim(p_first_name),
    btrim(p_last_name), nullif(btrim(p_preferred_name), ''), p_class_year,
    nullif(btrim(p_phone), ''), coalesce(p_answers, '{}'::jsonb), v_form.questions,
    nullif(btrim(p_referrer_text), ''), v_referrer_id, v_link_id, v_label,
    p_consent_version, p_consent_boxes
  )
  returning id into v_submission_id;

  return jsonb_build_object(
    'ok', true,
    'submission_id', v_submission_id,
    'chapter_id', v_form.chapter_id,
    'pnm_id', v_pnm_id,
    'candidate_id', v_candidate_id,
    'candidate_created', v_candidate_created,
    'pushed_up', v_pushed,
    'council_id', v_council_id,
    'email', v_email,
    'display_name', left(v_name, 200)
  );
end;
$$;

revoke all on function public.submit_interest_form(
  uuid, uuid, text, text, text, text, smallint, text, jsonb, text, text, text, text[]
) from public, anon, authenticated;
grant execute on function public.submit_interest_form(
  uuid, uuid, text, text, text, text, smallint, text, jsonb, text, text, text, text[]
) to service_role;

-- Replaces the chapter's live form in one transaction: the old slug stops
-- answering, and a new one takes its place with the same settings, open
-- state and QR labels (ADR-27). Null when the chapter has no live form.
create or replace function public.replace_interest_form(
  p_chapter_id uuid,
  p_slug       text,
  p_actor      uuid
)
returns public.chapter_interest_forms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old public.chapter_interest_forms;
  v_new public.chapter_interest_forms;
begin
  select * into v_old
    from public.chapter_interest_forms
   where chapter_id = p_chapter_id and replaced_at is null
   for update;
  if v_old.id is null then
    return null;
  end if;
  update public.chapter_interest_forms
     set replaced_at = now(), is_open = false, updated_at = now()
   where id = v_old.id;
  insert into public.chapter_interest_forms (
    chapter_id, slug, is_open, blurb, questions, ask_referrer, contacts_group_id, created_by
  ) values (
    p_chapter_id, p_slug, v_old.is_open, v_old.blurb, v_old.questions,
    v_old.ask_referrer, v_old.contacts_group_id, p_actor
  )
  returning * into v_new;
  insert into public.chapter_interest_form_labels (form_id, label)
  select v_new.id, label from public.chapter_interest_form_labels where form_id = v_old.id;
  return v_new;
end;
$$;

revoke all on function public.replace_interest_form(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.replace_interest_form(uuid, text, uuid) to service_role;

-- When the chapter's council link is accepted (or a season opens), the
-- chapter's form PNMs at the council's school join the master list: the
-- consent text they agreed to already names "the council {Chapter} belongs
-- to on Frapp (or, if it has none yet, the council it joins)". Every live
-- `interest_form` interest not yet tied to a registration is tied to the
-- season's; a PNM already on the list through another chapter keeps their
-- registration. Returns the council and the PNMs newly added to the list,
-- for the email each is owed.
create or replace function public.push_up_chapter_form_interests(p_chapter_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school record;
  v_target record;
  v_interest record;
  v_result jsonb;
  v_pushed jsonb := '[]'::jsonb;
  v_council uuid;
  v_listed boolean;
begin
  for v_school in
    select sc.school_id from public.school_chapters sc
     where sc.chapter_id = p_chapter_id and sc.status = 'active'
  loop
    select * into v_target from public.interest_form_push_target(p_chapter_id, v_school.school_id);
    continue when v_target.council_id is null;
    v_council := v_target.council_id;
    for v_interest in
      select i.pnm_id, p.school_email, p.first_name
        from public.pnm_interests i
        join public.pnms p on p.id = i.pnm_id
       where i.chapter_id = p_chapter_id
         and i.source = 'interest_form'
         and i.withdrawn_at is null
         and i.registration_id is null
         and p.merged_into_id is null
         and p.school_id = v_school.school_id
    loop
      select exists (
        select 1 from public.pnm_council_registrations r
         where r.pnm_id = v_interest.pnm_id and r.council_id = v_target.council_id
           and r.term = v_target.term and r.status <> 'withdrawn'
      ) into v_listed;
      v_result := public.record_pnm_interest(
        v_interest.pnm_id, p_chapter_id, 'interest_form', null, v_target.council_id, v_target.term
      );
      if (v_result ->> 'ok')::boolean and not v_listed then
        v_pushed := v_pushed || jsonb_build_array(jsonb_build_object(
          'pnm_id', v_interest.pnm_id, 'email', v_interest.school_email,
          'first_name', v_interest.first_name
        ));
      end if;
    end loop;
  end loop;
  return jsonb_build_object('council_id', v_council, 'pushed', v_pushed);
end;
$$;

revoke all on function public.push_up_chapter_form_interests(uuid) from public, anon, authenticated;
grant execute on function public.push_up_chapter_form_interests(uuid) to service_role;
