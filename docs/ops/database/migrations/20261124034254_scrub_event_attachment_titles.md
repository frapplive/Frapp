# 20261124034254_scrub_event_attachment_titles.sql

Rewrites the `title` of every document entry in `events.attachments` to "Document", so no stored document name reaches a member who can't open the file (#5921, Paul's go 2026-11-24; `spec/behavior/frapp-links.md`).

## Promotion

- **Purpose**: Before Frapp links (#4934), an event's document attachment stored the document's name in `title`, which every phone build shows to everyone who can see the event. Since #5923 the API writes the kind's word on each save; this rewrites the rows saved before it. Only document entries change; order, ids, web links and the other record kinds are left as they are.
- **Checks**:
  ```sql
  select count(*)
    from public.events e, jsonb_array_elements(e.attachments) as item(entry)
   where entry ->> 'kind' = 'document'
     and entry ->> 'title' is distinct from 'Document';
  ```
  Zero rows.
- **Promoter notes**: Writes data: one `update` on the events that hold a document entry with another title, a small set (attachments arrived with #4934). Any order against the API works: #5923's API already writes "Document" on save, and an older API revision writing a name back is corrected on the next save by the current one. Phone builds then show "Document" for those entries, and the web and current phone builds show the live name per reader.

## Rollback

Not reversible: the old names are not kept anywhere, which is the point. Reverting is never worth it, since the live name is read per reader from the document itself. If it had to be undone, restore `events.attachments` from a backup taken before the run ([playbook](../../db-rollback-playbook.md#decision-matrix)).

```sql
-- No forward undo: the overwritten names are not recoverable from the database.
```
