# 20261122221259_ai_suggestion_changes.sql

<!-- One page per migration: its promotion entry and its rollback recipe.
     check:migration-safety reads the two headings below. Shared procedure
     lives in ../promotion.md and ../../db-rollback-playbook.md; link to it,
     don't copy it. -->

Logs what people change when they decide on a Frapp AI suggestion (Paul, 2026-11-22): a new `ai_suggestion_changes` table, and `ask_id` plus a sealed `request_sealed` on `ai_suggestions`.

## Promotion

- **Purpose**: one row per decided suggestion in `ai_suggestion_changes` (decision, card or form, field-by-field verdicts as codes, ids and numbers, and the words sealed with `AI_STORED_TEXT_KEY` when the decider said yes to Frapp AI), kept at most 90 days. `ai_suggestions` gains `ask_id` (the Ask turn that proposed the card) and `request_sealed` (the member's question, sealed, emptied on decision by the redefined `ai_suggestions_decided_hold_no_text`).
- **Checks**: `select count(*) from ai_suggestion_changes;` answers (0 at first). `select public.ai_suggestion_change_fields_ok('{"title":{"verdict":"kept"}}'::jsonb);` is true and `select public.ai_suggestion_change_fields_ok('{"title":{"verdict":"kept","saved":"a sentence"}}'::jsonb);` is false. `select column_name from information_schema.columns where table_name = 'ai_suggestions' and column_name in ('ask_id','request_sealed');` returns both.
- **Promoter notes**: push before the API deploy: the new API writes the new columns and table. The old API ignores them. Writes no data. The words are kept only once `AI_STORED_TEXT_KEY` is set in Infisical for that environment; without it, rows hold the changes alone.

## Rollback

Worth reverting only if the table itself causes trouble; the API treats a failed write as a logged warning and the decision still stands. A forward migration:

```sql
drop table if exists public.ai_suggestion_changes;
drop function if exists public.ai_suggestion_change_fields_ok(jsonb);
drop function if exists public.ai_suggestion_change_value_ok(jsonb);
alter table public.ai_suggestions
  drop constraint if exists ai_suggestions_decided_hold_no_text;
alter table public.ai_suggestions
  add constraint ai_suggestions_decided_hold_no_text check (
    status in ('pending', 'accepting')
    or (payload = '{}'::jsonb and quote is null and quote_author_id is null)
  );
alter table public.ai_suggestions
  drop column if exists request_sealed,
  drop column if exists ask_id;
```

Deploy the API that doesn't write the columns first.
