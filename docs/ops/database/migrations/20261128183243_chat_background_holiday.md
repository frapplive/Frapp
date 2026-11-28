# 20261128183243_chat_background_holiday.sql

<!-- One page per migration: its promotion entry and its rollback recipe.
     check:migration-safety reads the two headings below. Shared procedure
     lives in ../promotion.md and ../../db-rollback-playbook.md; link to it,
     don't copy it. -->

Adds the Holiday chat background key and the chapter's season switch (#6149).

## Promotion

- **Purpose**: `chapters.chat_background_holiday boolean not null default true` holds the officer switch "Holiday background this season". The two background key CHECK constraints (`chapters_chat_background_key`, `chat_channels_background_key`) take `'holiday'` beside the keys 20261110235500 allowed. Writes no rows: the column's default is a constant.
- **Checks**: `select count(*) from public.chapters where chat_background_holiday is not true;` is `0` right after the push; `select pg_get_constraintdef(oid) from pg_constraint where conname in ('chapters_chat_background_key', 'chat_channels_background_key');` both list `'holiday'`.
- **Promoter notes**: apply before the API that reads the column and accepts the key. The API before it never selects the column, and never writes `holiday`, so the order only matters for the new API.

## Rollback

Not worth reverting on its own: an extra column and a wider CHECK break nothing. If it must go, a forward migration first moves any `holiday` choice back to Plain, then restores the narrower constraints and drops the column ([playbook](../../db-rollback-playbook.md#3-undo-one-migration)).

```sql
update public.chapters set chat_background = 'plain' where chat_background = 'holiday';
update public.chat_channels set background = null where background = 'holiday';
alter table public.chapters
  drop constraint if exists chapters_chat_background_key,
  add constraint chapters_chat_background_key check (
    chat_background in ('plain', 'gold-glow', 'midnight', 'game-day', 'letters', 'photo')
  ),
  drop column if exists chat_background_holiday;
alter table public.chat_channels
  drop constraint if exists chat_channels_background_key,
  add constraint chat_channels_background_key check (
    background is null
    or background in ('plain', 'gold-glow', 'midnight', 'game-day', 'letters', 'photo')
  );
```
