# 20261124223705_school_layer_affiliations_and_pnms.sql

<!-- One page per migration: its promotion entry and its rollback recipe.
     check:migration-safety reads the two headings below. Shared procedure
     lives in ../promotion.md and ../../db-rollback-playbook.md; link to it,
     don't copy it. -->

School layer 3 (#5974, plan on #5833): `school_chapters` gains `declined` and `ended` (and `ended_at`); new tables `council_chapters`, `pnms`, `council_recruitment_seasons`, `pnm_council_registrations`, `pnm_interests`, `pnm_merges`, `pnm_duplicate_dismissals` and `council_pnm_access_log`; `rush_candidates.pnm_id` and `origin`; functions `set_school_chapter_status`, `set_council_chapter_status`, `upsert_verified_pnm`, `record_pnm_interest`, `merge_pnms`, `delete_pnm`, `purge_expired_pnms` (plus the internal `lock_chapter_affiliations` and `pnm_survivor`); and account deletion (`users_drop_school_rows`) now deletes the person's `pnms` rows.

## Promotion

- **Purpose**: a chapter officer confirms the chapter's school, and a chapter and its school's council link only when both sides agree (`school-layer.md` § 2.4). PNMs are one record per verified school email per school, with interests per chapter, registrations per council season, a logged merge, and a 180-day retention sweep (§ 2.5, § 3.5). Every new table is RLS on with no policies, and every new function is executable by `service_role` only. `council_pnm_access_log` refuses update and delete, for the service role too.
- **Checks**:
  - `select conname from pg_constraint where conname in ('school_chapters_status_check', 'rush_candidates_origin_check') and convalidated;` returns both.
  - `select relname, relrowsecurity from pg_class where relname in ('council_chapters', 'pnms', 'council_recruitment_seasons', 'pnm_council_registrations', 'pnm_interests', 'pnm_merges', 'pnm_duplicate_dismissals', 'council_pnm_access_log');` shows eight rows, all `true`, and `select count(*) from pg_policies where tablename in (…the same eight…);` returns 0.
  - `select count(*) from rush_candidates where origin <> 'manual' or pnm_id is not null;` returns 0.
  - `select has_function_privilege('authenticated', 'public.merge_pnms(uuid, uuid, uuid, uuid)', 'execute');` returns false.
  - `update council_pnm_access_log set fields = '{}' where false;` succeeds (no rows), and the same with a row present raises `council_pnm_access_log is append-only`.
- **Promoter notes**: writes no data: every existing `rush_candidates` row takes the defaults (`pnm_id` null, `origin` `manual`), and no `school_chapters` row changes. Promote before the API from #5974, which reads the new tables and calls the functions; the old API reads none of them, so the other order is only a window where the new routes 500. The PNM retention sweep runs hourly from the API once it deploys; with no PNM rows it deletes nothing.

## Rollback

Worth it only together with reverting the API from #5974, and only before any PNM data exists in that environment (afterwards, dropping `pnms` deletes recruitment records people submitted). A forward migration drops the functions, the new tables, the two `rush_candidates` columns and their indexes, restores `users_drop_school_rows` without its `pnms` statement, and narrows `school_chapters` back after moving any `declined` or `ended` rows out ([playbook](../../db-rollback-playbook.md#decision-matrix)).

```sql
drop function if exists public.purge_expired_pnms(timestamptz);
drop function if exists public.delete_pnm(uuid);
drop function if exists public.merge_pnms(uuid, uuid, uuid, uuid);
drop function if exists public.record_pnm_interest(uuid, uuid, text, text, uuid, text);
drop function if exists public.upsert_verified_pnm(uuid, text, text, text, text, smallint, text, boolean, text, uuid);
drop function if exists public.pnm_survivor(uuid);
drop function if exists public.set_council_chapter_status(uuid, uuid, text, text, uuid);
drop function if exists public.set_school_chapter_status(uuid, uuid, text, uuid);
drop function if exists public.lock_chapter_affiliations(uuid);
drop table if exists public.council_pnm_access_log;
drop function if exists public.refuse_council_pnm_access_log_change();
drop index if exists public.rush_candidates_chapter_pnm_key;
drop index if exists public.idx_rush_candidates_pnm_id;
alter table public.rush_candidates
  drop constraint if exists rush_candidates_origin_check,
  drop column if exists origin,
  drop column if exists pnm_id;
drop table if exists public.pnm_duplicate_dismissals;
drop table if exists public.pnm_merges;
drop table if exists public.pnm_interests;
drop table if exists public.pnm_council_registrations;
drop table if exists public.council_recruitment_seasons;
drop table if exists public.pnms;
drop table if exists public.council_chapters;
delete from public.school_chapters where status in ('declined', 'ended');
alter table public.school_chapters drop constraint if exists school_chapters_status_check;
alter table public.school_chapters
  add constraint school_chapters_status_check check (status in ('proposed', 'active'));
alter table public.school_chapters drop column if exists ended_at;
-- Then re-run the `create or replace function public.users_drop_school_rows`
-- block from 20261123220535_school_layer_schools_and_membership.sql.
```
