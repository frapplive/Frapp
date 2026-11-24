# AI suggestion changes: what people change when Frapp Intelligence suggests something

How the Frapp team sees what members change when they confirm, edit or dismiss a Frapp Intelligence suggestion, so a weak suggestion can be found, understood and turned into an eval case (Paul, 2026-11-22). The rules are in [`spec/behavior/ai.md` § Stored AI text](../../spec/behavior/ai.md#stored-ai-text); the table is the migration's (`20261122221259_ai_suggestion_changes.sql`).

## What is kept

One row of `ai_suggestion_changes` per suggestion decided or expired, written by `AiSuggestionChangeLogService` when the suggestion service accepts, dismisses (sending a minutes task to the next agenda counts) or expires one. Today that covers every row of `ai_suggestions`: Ask's event, task and points cards, tasks suggested from minutes, and "this time last year" events (decision only, always `via = 'form'`).

| Column         | Holds                                                                                                                                                                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `decision`     | `accepted`, `dismissed` or `expired`                                                                                                                                                                                                                                                            |
| `via`          | On an accept: `card` (as shown, or with the card's own fields) or `form` (made in the full form the card's Edit opened)                                                                                                                                                                         |
| `fields`       | Field by field: `verdict` (`kept`, `changed`, `added`, `removed`), and for fields that are not free text the `proposed` and `saved` values as ids, numbers and booleans, with `delta_minutes` for a moment or a day. A text field has its verdict only. A field empty on both sides is left out |
| `ask_id`       | The Ask turn that made the card, the `id` of its row in `ai_ask_traces` ([`ask-answer-quality.md`](ask-answer-quality.md)), while that trace is kept. Null for a card from the older request lane (`ASK_AGENT` off), which keeps no trace                                                       |
| `words_sealed` | The member's question, the proposed text and the saved text, sealed with `AI_STORED_TEXT_KEY`, only when the member who decided has Frapp Intelligence on. Null without the key, and for a card drawn from chat (`ai_suggestions.drew_on_chat`, or a channel source)                                      |

The fields each kind compares are its handler's `changeLog` (`ai-suggestion-*-kind.ts`). A new event is always compared with the event as saved, read back, so who it invites is in the row even when it was set in the form.

A row is deleted after 90 days (the hourly suggestion sweep), when the member who decided or the member it was made for leaves the chapter, deletes their account or answers No on the AI sheet (a trigger on `members` and the consent listener), and with the chapter.

`ai-suggestion-accepted` in PostHog also carries `changed_fields` (names only) and `changed_field_count`.

## Reading it

Run these in the Supabase SQL editor. They read codes, ids and numbers, so the results can go in an issue; a chapter's or a member's id still should not.

Which fields members change most, by kind, over the last 30 days:

```sql
select c.kind, f.key as field,
       count(*) filter (where f.value->>'verdict' <> 'kept') as changed,
       count(*) as seen
from ai_suggestion_changes c, jsonb_each(c.fields) f
where c.decision = 'accepted' and c.decided_at > now() - interval '30 days'
group by 1, 2
order by changed desc;
```

How suggestions end, by kind:

```sql
select kind, decision, via, count(*)
from ai_suggestion_changes
where decided_at > now() - interval '30 days'
group by 1, 2, 3
order by 1, 2, 3;
```

Event cards whose invitees were changed (the case behind this log):

```sql
select suggestion_id, ask_id, via, fields -> 'optional_role_ids' as invited,
       fields -> 'required_role_ids' as required
from ai_suggestion_changes
where kind = 'new_event'
  and (fields ? 'optional_role_ids' or fields ? 'required_role_ids')
order by decided_at desc;
```

## Reading the words

As the other stored AI text ([`ai-stored-text.md` § Reading what was kept](ai-stored-text.md#reading-what-was-kept)), on a team member's own machine, never through an API:

1. Export the rows, each with its suggestion id (the words are sealed to it):

   ```sql
   select json_build_object('id', suggestion_id, 'chapter_id', chapter_id, 'sealed', words_sealed)
   from ai_suggestion_changes
   where words_sealed is not null and kind = 'new_event'
   order by decided_at desc;
   ```

2. With `AI_STORED_TEXT_KEY` set in that shell, from `apps/api`:

   ```sh
   npm run -s ai:open-suggestion-changes < rows.jsonl
   ```

   Each line is `{"id": …, "request": …, "proposed": {…}, "saved": {…}}`.

Treat the output as stored text: don't paste it into an issue, a PR, Sentry, PostHog or a chat. To make an eval case from one, write the case by hand in `apps/api/test/ai-evals/` with invented names, as the existing cases are, and delete the export and the output when done.

## Not covered yet

Minutes drafts against the posted minutes, Backwork's AI fill, and the event form's last-year fill do not write rows yet. Each is to add its own compare to this table rather than a table of its own.
