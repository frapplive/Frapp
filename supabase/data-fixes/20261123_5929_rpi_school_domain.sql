-- Data fix #5929: let RPI students verify their school email.
--
-- School layer 1 (migration 20261124182353_school_layer_schools_and_membership)
-- seeds one school per chapter_directory university, every one `unverified`
-- and with no email domain, because our data has no domains (school-layer.md
-- § 7 step 4). Staff add each school's domain per environment with a data fix
-- like this one (Winston, 2026-11-23, #5929). RPI is the first: it is Phi
-- Gamma Delta Tau Nu's school, the IFC pilot (#5833).
--
-- What it does, in one transaction:
--   1. marks Rensselaer Polytechnic Institute `verified`, so its students can
--      verify (an unverified school accepts no codes);
--   2. verifies `rpi.edu` for it through `verify_school_domain`, as staff,
--      without subdomains. Only an address ending in exactly `@rpi.edu`
--      counts. A subdomain needs its own call, so nobody verifies against an
--      alumni or department mail host by accident.
--
-- `verify_school_domain` refuses a domain another school holds, and the final
-- check raises, rolling everything back, unless RPI ends up verified with
-- `rpi.edu` as its one verified domain. Re-running it changes nothing.
--
-- Hosted projects are changed only with the owner's approval: Paul runs this
-- on staging and production. It is the statement to apply, not a migration.
-- Locally: `psql "$(npm run -s supabase -- status -o env | sed -n 's/^DB_URL=//p' | tr -d '"')" -f supabase/data-fixes/20261123_5929_rpi_school_domain.sql`.
--
-- Pre-check (read only):
--   select s.id, s.name, s.status, ss.slug
--     from schools s
--     join school_slugs ss on ss.school_id = s.id and ss.retired_at is null
--    where s.directory_university = 'Rensselaer Polytechnic Institute';
-- Expect one row, slug `rpi`.

begin;

do $$
declare
  v_school uuid;
begin
  select id into v_school
    from public.schools
   where directory_university = 'Rensselaer Polytechnic Institute';
  if v_school is null then
    raise exception 'fix 5929: no school for Rensselaer Polytechnic Institute; is the school-layer migration applied?';
  end if;

  update public.schools
     set status = 'verified', updated_at = now()
   where id = v_school and status <> 'verified';

  perform public.verify_school_domain(v_school, 'rpi.edu', false, 'staff', null);

  if not exists (
    select 1 from public.schools where id = v_school and status = 'verified'
  ) or (
    select count(*) from public.school_email_domains
     where school_id = v_school and status = 'verified'
  ) <> 1 or not exists (
    select 1 from public.school_email_domains
     where school_id = v_school and status = 'verified'
       and domain = 'rpi.edu' and not include_subdomains
  ) then
    raise exception 'fix 5929: RPI did not end up verified with rpi.edu as its one domain; rolled back';
  end if;
end;
$$;

commit;
