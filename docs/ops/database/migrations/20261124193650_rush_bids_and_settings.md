# 20261124193650_rush_bids_and_settings.sql

<!-- One page per migration: its promotion entry and its rollback recipe.
     check:migration-safety reads the two headings below. Shared procedure
     lives in ../promotion.md and ../../db-rollback-playbook.md; link to it,
     don't copy it. -->

Adds the rest of the Recruitment settings page to `rush_settings`: the new-member role, the recruitment contacts Group and the card channel (#5973).

## Promotion

- **Purpose**: `rush_settings` gains three nullable columns, `new_member_role_id` (→ `roles`), `contacts_group_id` (→ `chapter_groups`) and `card_channel_id` (→ `chat_channels`), each `on delete set null` so deleting the role, group or channel clears the pick and keeps the row, plus a partial index on each for those deletes. Writes no data; a null role means the default, which the API works out on read.
- **Checks**: `select count(*) from rush_settings where new_member_role_id is not null or contacts_group_id is not null or card_channel_id is not null;` returns 0 right after the push. `select count(*) from pg_indexes where indexname like 'rush_settings_%_idx';` returns 3.
- **Promoter notes**: push before the API that reads it. `GET /v1/rush/settings` and the pipeline's settings read select `*`, so an older API ignores the new columns; a newer API ahead of this migration fails every settings save. Needs `20261124191552_rush_followups.sql` first, which creates `rush_settings`.

## Rollback

Worth reverting only if the new columns themselves cause trouble. Revert the API first, because its settings save writes these columns. Forward migration:

```sql
drop index if exists public.rush_settings_new_member_role_idx;
drop index if exists public.rush_settings_contacts_group_idx;
drop index if exists public.rush_settings_card_channel_idx;
alter table public.rush_settings
  drop column if exists new_member_role_id,
  drop column if exists contacts_group_id,
  drop column if exists card_channel_id;
```
