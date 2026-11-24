# 20261124144042_chapter_interest_forms.sql

<!-- One page per migration: its promotion entry and its rollback recipe.
     check:migration-safety reads the two headings below. Shared procedure
     lives in ../promotion.md and ../../db-rollback-playbook.md; link to it,
     don't copy it. -->

The chapter interest form at `/f/<form-slug>` (#5977): its tables, its one-time codes, the one-transaction submission and the push-up to the council's master list.

## Promotion

- **Purpose**: adds `chapter_interest_forms`, `chapter_interest_form_labels`, `interest_form_verifications` and `interest_form_submissions` (RLS on, no policies) and the service-role functions `start_interest_form_code`, `confirm_interest_form_code`, `submit_interest_form`, `push_up_chapter_form_interests`, `replace_interest_form`, and the withdraw link's `preview_interest_form_withdrawal` and `withdraw_interest_form`. `rush_candidates.created_by` becomes optional for a candidate the PNM's own form created (`origin = 'pnm'`), and the name rule `rush_candidates_chapter_name_key` is rebuilt as `rush_candidates_chapter_manual_name_key`, partial on `origin = 'manual'` (`school-layer.md` § 2.5). Writes no rows.
- **Checks**: `select count(*) from chapter_interest_forms;` is 0; `select indexdef from pg_indexes where indexname = 'rush_candidates_chapter_manual_name_key';` shows `WHERE (origin = 'manual'::text)`; `select is_nullable from information_schema.columns where table_name = 'rush_candidates' and column_name = 'created_by';` is `YES`.
- **Promoter notes**: apply before the API that calls the functions; the API before it only ever writes `created_by`, so the dropped `NOT NULL` changes nothing for it. Needs `20261124082248_school_layer_affiliations_and_pnms.sql` and `20261124065057_rush_pipeline.sql` first.

## Rollback

Reverting is worth it only if the form must come out entirely. A forward migration drops the new objects; restoring `NOT NULL` and the full name index fails while any form-created candidate exists or two of them share a name, so delete those first (they're PNM data the chapter received through the form).

```sql
drop function if exists public.withdraw_interest_form(text, text);
drop function if exists public.preview_interest_form_withdrawal(text);
drop function if exists public.replace_interest_form(uuid, text, uuid);
drop function if exists public.push_up_chapter_form_interests(uuid);
drop function if exists public.submit_interest_form(uuid, uuid, text, text, text, text, smallint, text, jsonb, text, text, text, text[], text, integer);
drop function if exists public.confirm_interest_form_code(uuid, uuid, text, text, integer, integer);
drop function if exists public.start_interest_form_code(uuid, text, text, text, text, integer, integer, integer, integer, integer);
drop function if exists public.interest_form_push_target(uuid, uuid);
drop function if exists public.interest_form_has_school(uuid);
drop function if exists public.interest_form_school_for(uuid, text);
drop function if exists public.interest_form_chapter_ok(uuid);
drop table if exists public.interest_form_submissions;
drop table if exists public.interest_form_verifications;
drop table if exists public.chapter_interest_form_labels;
drop table if exists public.chapter_interest_forms;
delete from public.rush_candidates where origin = 'pnm' and created_by is null;
create unique index if not exists rush_candidates_chapter_name_key
  on public.rush_candidates (chapter_id, name_key);
drop index if exists public.rush_candidates_chapter_manual_name_key;
alter table public.rush_candidates drop constraint if exists rush_candidates_created_by_manual;
alter table public.rush_candidates alter column created_by set not null;
```
