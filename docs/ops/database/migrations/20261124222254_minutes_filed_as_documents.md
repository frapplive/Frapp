# 20261124222254_minutes_filed_as_documents.sql

<!-- One page per migration: its promotion entry and its rollback recipe.
     check:migration-safety reads the two headings below. Shared procedure
     lives in ../promotion.md and ../../db-rollback-playbook.md; link to it,
     don't copy it. -->

Files each meeting's posted minutes as a row in `chapter_documents` (#5949, step 5 of #5943; Paul, 2026-11-24: "File minutes as documents"): adds `chapter_documents.meeting_id`, lets a row have no file and no uploader, adds `chapter_document_folders.minutes_series_key`, and adds `file_minutes_document()` and `file_unfiled_minutes()`. It files nothing itself: the API from #5949 files minutes posted before it once it is live.

## Promotion

- **Purpose**: Documents lists a meeting's posted minutes beside the chapter's files, so the Meetings list page can go (`spec/behavior/chapter-docs.md` § Minutes). After it:
  - a `chapter_documents` row is a file (`storage_path` and `uploaded_by` set, `meeting_id` null) or a meeting's minutes (`meeting_id` set, the other two null), never both (`chapter_documents_file_or_minutes`), at most one row per meeting (`chapter_documents_meeting_id_key`), and always the same chapter as its meeting (`chapter_documents_meeting_fkey` on `(meeting_id, chapter_id)`, `on delete cascade`, so deleting minutes removes their row);
  - `file_minutes_document(chapter, meeting)` files posted minutes: in the chapter's Minutes folder (`minutes_series_key = 'root'`; an open folder already named "Minutes" or "Meeting Minutes" is taken as it), or for a repeating meeting in that series' folder under it, made on first use. The API calls it when minutes post and on each later save;
  - a minutes row is never indexed as a `chapter_document` for the assistant (`corpus_follow_chapter_document` skips it): posted minutes are already indexed as `meeting_minutes`, read under the meeting's own rule;
  - a series folder whose last minutes are deleted is removed when it holds nothing else (`trg_chapter_documents_minutes_folder`).

  Who sees a minutes row is decided by the API from the meeting's own rule each time it is read. Nothing about the audience is stored on the row.
- **Checks**:
  - `select count(*) from chapter_documents where meeting_id is not null;` returns 0 until the API from #5949 is live. A few minutes after it is, `select count(*) from meetings m where m.status = 'posted' and not exists (select 1 from chapter_documents d where d.meeting_id = m.id);` returns 0.
  - `select count(*) from chapter_documents d join meetings m on m.id = d.meeting_id where m.status <> 'posted' or m.chapter_id <> d.chapter_id;` returns 0.
  - `select count(*) from chapter_documents where (meeting_id is null) <> (storage_path is not null);` returns 0.
  - `select count(*) from corpus_sources s join chapter_documents d on d.id = s.source_id where s.source_type = 'chapter_document' and d.meeting_id is not null;` returns 0.
  - `select chapter_id, count(*) from chapter_document_folders where minutes_series_key = 'root' group by chapter_id having count(*) > 1;` returns no rows.
  - `select has_function_privilege('authenticated', 'public.file_minutes_document(uuid, uuid)', 'execute');` returns false.
- **Promoter notes**: The migration writes no rows. It builds a unique index on `meetings (id, chapter_id)` and validates two constraints on `chapter_documents`; both tables are small (a chapter's meetings and files). Either deploy order is safe: the API before #5949 reads neither new column, and the API from #5949 needs both, so this goes first, as Deploy production does. The backfill is the API's: once the API from #5949 is live, its sweep (`MinutesDocumentSweepService`, every five minutes) calls `file_unfiled_minutes`, which writes one `chapter_documents` row per posted meeting and, per chapter that has any, one Minutes folder (or its existing open "Minutes" or "Meeting Minutes" folder marked as it), a folder per repeating series, and a "Minutes" document type where the chapter has none. It is done this way because the API before #5949 would list a filed row, by its meeting's name and folder (never the minutes' text), to every member who can open Documents. For the same reason an API rollback past #5949 runs the first line of the rollback below at once.

## Rollback

Worth it only together with reverting the API from #5949. A forward migration ([playbook](../../db-rollback-playbook.md#decision-matrix)) that deletes the minutes rows (the minutes themselves are untouched in `meetings`), restores the corpus trigger function from `20261112165050_ai_corpus.sql`, and drops what this added. Folders the filing made stay as ordinary empty folders; stars and pins on minutes rows go with the rows.

```sql
delete from public.chapter_documents where meeting_id is not null;
drop function if exists public.file_unfiled_minutes(integer);
drop trigger if exists trg_chapter_documents_minutes_folder on public.chapter_documents;
drop function if exists public.drop_empty_minutes_series_folder();
drop function if exists public.file_minutes_document(uuid, uuid);
drop function if exists public.free_document_folder_name(uuid, text);
-- Then re-run the `create or replace function public.corpus_follow_chapter_document`
-- block from 20261112165050_ai_corpus.sql unchanged.
drop index if exists public.chapter_document_folders_minutes_series_key;
alter table public.chapter_document_folders
  drop constraint if exists chapter_document_folders_minutes_series_key_len,
  drop column if exists minutes_series_key;
drop index if exists public.chapter_documents_meeting_id_key;
alter table public.chapter_documents
  drop constraint if exists chapter_documents_file_or_minutes,
  drop constraint if exists chapter_documents_meeting_fkey,
  drop column if exists meeting_id;
alter table public.chapter_documents alter column storage_path set not null;
alter table public.chapter_documents alter column uploaded_by set not null;
drop index if exists public.meetings_id_chapter_key;
```
