# 20261122221259_ai_suggestion_changes.sql

<!-- One page per migration: its promotion entry and its rollback recipe.
     check:migration-safety reads the two headings below. Shared procedure
     lives in ../promotion.md and ../../db-rollback-playbook.md; link to it,
     don't copy it. -->

Logs what people change when they decide on a Frapp AI suggestion (Paul, 2026-11-22): a new `ai_suggestion_changes` table, and `ask_id`, a sealed `request_sealed` and `drew_on_chat` on `ai_suggestions`.

## Promotion

- **Purpose**: one row per decided suggestion in `ai_suggestion_changes` (decision, card or form, field-by-field verdicts as codes, ids and numbers, and the words sealed with `AI_STORED_TEXT_KEY` when the decider said yes to Frapp AI), kept at most 90 days. `ai_suggestions` gains `ask_id` (the Ask turn that proposed the card), `request_sealed` (the member's question, sealed, emptied on decision by the trigger `ai_suggestions_drop_request_on_decide` and held there by the redefined `ai_suggestions_decided_hold_no_text`) and `drew_on_chat` (no words kept for that card). A trigger on `members` delete (`ai_suggestion_changes_member_left`) takes the rows and sealed questions of a member a card was made for when they leave.
- **Checks**: `select count(*) from ai_suggestion_changes;` answers (0 at first). `select public.ai_suggestion_change_fields_ok('{"title":{"verdict":"kept"}}'::jsonb);` is true and `select public.ai_suggestion_change_fields_ok('{"title":{"verdict":"kept","saved":"a sentence"}}'::jsonb);` is false. `select column_name from information_schema.columns where table_name = 'ai_suggestions' and column_name in ('ask_id','request_sealed','drew_on_chat');` returns all three. `select tgname from pg_trigger where tgname in ('ai_suggestions_drop_request_on_decide','ai_suggestion_changes_member_left');` returns both.
- **Promoter notes**: push before the API deploy: the new API writes the new columns and table. The old API never reads them, and can still decide and expire a card the new API sealed a question on, because the trigger empties `request_sealed` on that write. Writes no data. The words are kept only once `AI_STORED_TEXT_KEY` is set in Infisical for that environment; without it, rows hold the changes alone.

## Rollback

Worth reverting only if the table itself causes trouble; the API treats a failed write as a logged warning and the decision still stands. A forward migration:

```sql
drop trigger if exists ai_suggestion_changes_member_left on public.members;
drop function if exists public.ai_suggestion_changes_member_left();
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
drop trigger if exists ai_suggestions_drop_request_on_decide on public.ai_suggestions;
drop function if exists public.ai_suggestions_drop_request_on_decide();
alter table public.ai_suggestions
  drop column if exists drew_on_chat,
  drop column if exists request_sealed,
  drop column if exists ask_id;
```

Deploy the API that doesn't write the columns first: the new API writes them on every proposal and fails without them.
