# 20261123220535_school_layer_schools_and_membership.sql

<!-- One page per migration: its promotion entry and its rollback recipe.
     check:migration-safety reads the two headings below. Shared procedure
     lives in ../promotion.md and ../../db-rollback-playbook.md; link to it,
     don't copy it. -->

School layer 1 ([#5929](https://github.com/frapplive/Frapp/issues/5929), plan on [#5833](https://github.com/frapplive/Frapp/issues/5833)): schools, their email domains and slugs, school membership, school-email verification codes and a minimal `school_chapters`, per [`school-layer.md`](../../../../spec/architecture/school-layer.md) § 2.1, § 2.2 and § 4.1.

## Promotion

- **Purpose**: Six new tables, each with RLS on and no policies: `schools`, `school_email_domains`, `school_slugs`, `school_members`, `school_email_verifications`, `school_chapters`. It seeds one `unverified` school per distinct `chapter_directory.university` (retired rows aside; 1,281 on 2026-11-23), each with one current slug: its short name when only it carries that short name in the directory (`rpi`), else its full name (`arizona-state-university`). It adds service-role-only functions: `verify_school_domain`, `search_schools`, `start_school_email_verification` and `confirm_school_email_verification`. It adds a trigger that deletes a person's school rows when `users.deleted_at` is set, and one expression index on `chapter_directory`. No existing row is written.
- **Checks**:
  - `select count(*) from schools;` matches `select count(distinct university) from chapter_directory where source <> 'retired';`.
  - `select count(*) from schools s where not exists (select 1 from school_slugs ss where ss.school_id = s.id and ss.retired_at is null);` returns 0.
  - `select slug from school_slugs ss join schools s on s.id = ss.school_id where s.directory_university = 'Rensselaer Polytechnic Institute';` returns `rpi`.
  - `select count(*) from school_email_domains;` returns 0: no school can verify students yet.
- **Promoter notes**:
  - Apply before the API that reads these tables, which `_deploy.yml` already does. An older API ignores them.
  - Needs `20261123194106_tenant_slugs_and_kind.sql` first, for `tenant_slug_part` and `is_reserved_tenant_slug`.
  - The seed takes well under a second locally.
  - **Domains are a separate, owner-run step.** After the migration no school accepts a code. [`supabase/data-fixes/20261123_5929_rpi_school_domain.sql`](../../../../supabase/data-fixes/20261123_5929_rpi_school_domain.sql) verifies RPI and `rpi.edu`. Paul runs it per environment, and records on #5929 when it ran. Each later school gets its own data fix the same way.

## Rollback

Worth reverting only if the seed or the tables are wrong before any student has verified. After that, `school_members` rows are people's verified records, and dropping them makes every student verify again. A forward migration drops everything this one adds:

```sql
drop trigger if exists users_drop_school_rows on public.users;
drop function if exists public.users_drop_school_rows();
drop function if exists public.confirm_school_email_verification(uuid, uuid, uuid, text, integer);
drop function if exists public.start_school_email_verification(uuid, uuid, text, text, text, text, integer, integer, integer, integer, integer, integer);
drop function if exists public.search_schools(text, integer);
drop function if exists public.school_accepts_email_domain(uuid, text);
drop function if exists public.verify_school_domain(uuid, text, boolean, text, uuid);
drop function if exists public.backfill_schools_from_directory();
drop table if exists public.school_chapters, public.school_email_verifications,
  public.school_members, public.school_slugs, public.school_email_domains,
  public.schools cascade;
drop function if exists public.schools_assign_school_slug();
drop function if exists public.school_slugs_keep_owner();
drop function if exists public.assign_default_school_slug(uuid);
drop function if exists public.default_school_slug_base(uuid);
drop index if exists public.idx_chapter_directory_short_slug_part;
```
