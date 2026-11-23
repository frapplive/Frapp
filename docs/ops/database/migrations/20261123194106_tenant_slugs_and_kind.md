# 20261123194106_tenant_slugs_and_kind.sql

<!-- One page per migration: its promotion entry and its rollback recipe.
     check:migration-safety reads the two headings below. Shared procedure
     lives in ../promotion.md and ../../db-rollback-playbook.md; link to it,
     don't copy it. -->

ADR-27 rollout step 1 (#5918, plan on #5833): adds `chapters.kind`, the `tenant_slugs` registry with a slug for every chapter, an insert trigger that gives each new chapter its default slug, and `kind` in `get_request_context`'s `chapter` part.

## Promotion

- **Purpose**: every tenant has a kind (`chapter`, or `council` once councils exist) and exactly one current URL slug, such as `fiji-rpi`. A slug is never reused by another tenant, retired or not, because the primary key spans both. The API's `ChapterGuard` reads `kind` to refuse a tenant of a kind the route doesn't serve, and `GET /v1/chapters` and `GET /v1/tenants/resolve` read the slugs. No client reads either before ADR-27 step 2.
- **Checks**:
  - `select count(*) from chapters c where not exists (select 1 from tenant_slugs t where t.chapter_id = c.id and t.retired_at is null);` returns 0.
  - `select chapter_id, count(*) from tenant_slugs where retired_at is null group by chapter_id having count(*) > 1;` returns no rows.
  - `select count(*) from tenant_slugs where public.is_reserved_tenant_slug(slug);` returns 0.
  - `select distinct kind from chapters;` returns only `chapter`.
  - `select (public.get_request_context(gen_random_uuid(), (select id from chapters limit 1)))->'chapter' ? 'kind';` returns true.
  - `select has_function_privilege('authenticated', 'public.assign_default_tenant_slug(uuid)', 'execute');` returns false.
- **Promoter notes**: writes data: one `tenant_slugs` row per chapter, oldest chapter first, so on a default-slug tie the older chapter keeps the plain slug and the newer gets `-2`. Promote before the API from #5918. The API selects `chapters.kind` in the guard's direct read, so an API deployed against a database without this migration answers every chapter route with a 503 until it lands. The other order is safe: the old API reads neither the new column nor the new table, and ignores the extra `kind` key in `get_request_context`.

## Rollback

Rarely worth it, and only together with reverting the API from #5918, which needs both the column and the table. A forward migration that drops the trigger and functions, restores `get_request_context` from 20261116143520 (without the `kind` key), drops the table and then the column ([playbook](../../db-rollback-playbook.md#decision-matrix)). Dropping `tenant_slugs` loses the record of which slugs were retired; that only matters once a client links by slug (ADR-27 step 2).

```sql
drop trigger if exists chapters_assign_tenant_slug on public.chapters;
drop function if exists public.chapters_assign_tenant_slug();
drop function if exists public.assign_default_tenant_slug(uuid);
drop function if exists public.default_tenant_slug_base(uuid);
drop function if exists public.tenant_slug_part(text);
drop function if exists public.is_reserved_tenant_slug(text);
-- Then re-run the `create or replace function public.get_request_context`
-- block from 20261116143520_request_context_skips_deleted_users.sql unchanged.
drop table if exists public.tenant_slugs;
alter table public.chapters drop column if exists kind;
```
