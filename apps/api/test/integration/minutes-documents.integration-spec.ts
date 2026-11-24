// Posted minutes filed as documents (#5949), against a real database.
//
// `file_minutes_document` decides where a meeting's minutes are filed, and the
// table's constraints decide what a minutes row may be. Both are SQL, so only
// a live database answers them: that a set of minutes gets one row however
// often it is filed, that a repeating meeting gets its series' folder and a
// one-off the chapter's Minutes folder, that an open "Meeting Minutes" folder
// the chapter already keeps is taken as that folder while a limited one is
// left alone, that a draft is never filed, that deleting the minutes removes
// the row and an emptied series folder, and that the assistant's index never
// gets a minutes row as a document.
//
// Who may see a row is not decided here: that is `MeetingService`'s rule,
// asked by `ChapterDocumentService` (their unit specs).
//
// Run: `npm run test:integration -w apps/api` (needs a local Supabase stack;
// skips cleanly without one). Not run by CI today (#1568), like the other
// integration suites.

import { randomUUID } from 'node:crypto';
import { SupabaseChapterDocumentRepository } from '../../src/infrastructure/supabase/repositories/supabase-chapter-document.repository';
import type { FrappSupabaseClient } from '../../src/infrastructure/supabase/database.types';
import { createServiceRoleClient, describeIntegration } from './stack';

describeIntegration('Posted minutes filed as documents (#5949)', () => {
  let supabase: FrappSupabaseClient;
  let repo: SupabaseChapterDocumentRepository;

  const chapterId = randomUUID();
  const otherChapterId = randomUUID();
  const secretaryId = randomUUID();
  const START = Date.parse('2026-11-01T00:00:00.000Z');
  const WEEK = 7 * 86_400_000;

  const assertOk = (label: string, error: { message: string } | null) => {
    if (error) throw new Error(`seed ${label}: ${error.message}`);
  };

  async function addEvent(
    name: string,
    week: number,
    extra: Record<string, unknown> = {},
    chapter = chapterId,
  ): Promise<string> {
    const id = randomUUID();
    const start = new Date(START + week * WEEK);
    assertOk(
      'events',
      (
        await supabase.from('events').insert({
          id,
          chapter_id: chapter,
          name,
          start_time: start.toISOString(),
          end_time: new Date(start.getTime() + 3_600_000).toISOString(),
          point_value: 0,
          is_mandatory: false,
          ...extra,
        } as never)
      ).error,
    );
    return id;
  }

  async function addMinutes(
    eventId: string | null,
    name: string,
    status: 'draft' | 'posted',
    chapter = chapterId,
  ): Promise<string> {
    const id = randomUUID();
    assertOk(
      'meetings',
      (
        await supabase.from('meetings').insert({
          id,
          chapter_id: chapter,
          event_id: eventId,
          event_name: name,
          event_start_time: new Date(START).toISOString(),
          meeting_type: 'chapter',
          status,
          posted_at: status === 'posted' ? new Date().toISOString() : null,
          posted_by: status === 'posted' ? secretaryId : null,
          created_by: secretaryId,
        } as never)
      ).error,
    );
    return id;
  }

  const rowsOf = async (meetingId: string) => {
    const { data, error } = await supabase
      .from('chapter_documents')
      .select('*')
      .eq('meeting_id', meetingId);
    if (error) throw error;
    return data ?? [];
  };

  const foldersOf = async (chapter = chapterId) => {
    const { data, error } = await supabase
      .from('chapter_document_folders')
      .select('*')
      .eq('chapter_id', chapter)
      .order('sort_order');
    if (error) throw error;
    return data ?? [];
  };

  beforeAll(async () => {
    supabase = createServiceRoleClient();
    repo = new SupabaseChapterDocumentRepository(supabase);
    assertOk(
      'chapters',
      (
        await supabase.from('chapters').insert(
          [chapterId, otherChapterId].map((id) => ({
            id,
            name: `minutes-docs-${id.slice(0, 8)}`,
            university: 'Integration Test University',
          })) as never,
        )
      ).error,
    );
    assertOk(
      'users',
      (
        await supabase.from('users').insert({
          id: secretaryId,
          supabase_auth_id: randomUUID(),
          email: `minutes-docs-${secretaryId}@example.test`,
          display_name: 'Secretary',
        } as never)
      ).error,
    );
  });

  afterAll(async () => {
    if (!supabase) return;
    const chapters = [chapterId, otherChapterId];
    await supabase.from('meetings').delete().in('chapter_id', chapters);
    await supabase
      .from('chapter_documents')
      .delete()
      .in('chapter_id', chapters);
    await supabase
      .from('chapter_document_folders')
      .delete()
      .in('chapter_id', chapters);
    await supabase.from('events').delete().in('chapter_id', chapters);
    await supabase.from('users').delete().eq('id', secretaryId);
    await supabase.from('chapters').delete().in('id', chapters);
  });

  it('files a one-off meeting once in the Minutes folder, as a row with no file and no uploader', async () => {
    const eventId = await addEvent('Budget meeting', 0);
    const meetingId = await addMinutes(eventId, 'Budget meeting', 'posted');

    const first = await repo.fileMinutes(chapterId, meetingId);
    const again = await repo.fileMinutes(chapterId, meetingId);
    expect(first).not.toBeNull();
    expect(again).toBe(first);

    const rows = await rowsOf(meetingId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: first,
      chapter_id: chapterId,
      title: 'Budget meeting',
      folder: 'Minutes',
      document_type: 'Minutes',
      storage_path: null,
      uploaded_by: null,
      who_can_see: null,
    });
    const root = (await foldersOf()).find(
      (folder) => folder.minutes_series_key === 'root',
    );
    expect(root?.name).toBe('Minutes');
  });

  it("files a repeating meeting in its series' folder under Minutes, made once", async () => {
    const head = await addEvent('Chapter Meeting', 1, {
      recurrence_rule: 'FREQ=WEEKLY',
    });
    const second = await addEvent('Chapter Meeting', 2, {
      parent_event_id: head,
    });
    const first = await addMinutes(head, 'Chapter Meeting', 'posted');
    const next = await addMinutes(second, 'Chapter Meeting', 'posted');

    await repo.fileMinutes(chapterId, first);
    await repo.fileMinutes(chapterId, next);

    expect((await rowsOf(first))[0].folder).toBe('Minutes / Chapter Meeting');
    expect((await rowsOf(next))[0].folder).toBe('Minutes / Chapter Meeting');
    const series = (await foldersOf()).filter(
      (folder) => folder.minutes_series_key === head,
    );
    expect(series.map((folder) => folder.name)).toEqual([
      'Minutes / Chapter Meeting',
    ]);
  });

  it('never files a draft, another chapter’s minutes, or minutes that are not there', async () => {
    const eventId = await addEvent('Exec meeting', 3);
    const draft = await addMinutes(eventId, 'Exec meeting', 'draft');
    await expect(repo.fileMinutes(chapterId, draft)).resolves.toBeNull();
    expect(await rowsOf(draft)).toEqual([]);

    const theirsEvent = await addEvent('Theirs', 3, {}, otherChapterId);
    const theirs = await addMinutes(
      theirsEvent,
      'Theirs',
      'posted',
      otherChapterId,
    );
    await expect(repo.fileMinutes(chapterId, theirs)).resolves.toBeNull();
    expect(await rowsOf(theirs)).toEqual([]);
    await expect(repo.fileMinutes(chapterId, randomUUID())).resolves.toBeNull();
  });

  it('follows a renamed meeting and leaves a row an officer moved where it is', async () => {
    const eventId = await addEvent('Rush debrief', 4);
    const meetingId = await addMinutes(eventId, 'Rush debrief', 'posted');
    const documentId = await repo.fileMinutes(chapterId, meetingId);
    await repo.updateFiling(documentId as string, chapterId, {
      folder: null,
    });
    assertOk(
      'rename',
      (
        await supabase
          .from('meetings')
          .update({ event_name: 'Recruitment debrief' } as never)
          .eq('id', meetingId)
      ).error,
    );

    await repo.fileMinutes(chapterId, meetingId);
    expect(await rowsOf(meetingId)).toMatchObject([
      { id: documentId, title: 'Recruitment debrief', folder: null },
    ]);
  });

  it('removes the row with the minutes, and a series folder its last minutes left empty', async () => {
    const head = await addEvent('Standards Board', 5, {
      recurrence_rule: 'FREQ=MONTHLY',
    });
    const meetingId = await addMinutes(head, 'Standards Board', 'posted');
    await repo.fileMinutes(chapterId, meetingId);
    expect(
      (await foldersOf()).some((folder) => folder.minutes_series_key === head),
    ).toBe(true);

    assertOk(
      'delete',
      (await supabase.from('meetings').delete().eq('id', meetingId)).error,
    );
    expect(await rowsOf(meetingId)).toEqual([]);
    const after = await foldersOf();
    expect(after.some((folder) => folder.minutes_series_key === head)).toBe(
      false,
    );
    // The chapter's Minutes folder stays.
    expect(after.some((folder) => folder.minutes_series_key === 'root')).toBe(
      true,
    );
  });

  it('refuses a row that is both a file and minutes, and a second row for one meeting', async () => {
    const eventId = await addEvent('Formal planning', 6);
    const meetingId = await addMinutes(eventId, 'Formal planning', 'posted');
    await repo.fileMinutes(chapterId, meetingId);

    const second = await supabase.from('chapter_documents').insert({
      chapter_id: chapterId,
      title: 'Second',
      meeting_id: meetingId,
    } as never);
    expect(second.error).not.toBeNull();

    const both = await supabase.from('chapter_documents').insert({
      chapter_id: chapterId,
      title: 'Both',
      meeting_id: await addMinutes(null, 'Loose', 'posted'),
      storage_path: `chapters/${chapterId}/documents/${randomUUID()}/x.pdf`,
      uploaded_by: secretaryId,
    } as never);
    expect(both.error?.message).toContain('chapter_documents_file_or_minutes');

    const neither = await supabase.from('chapter_documents').insert({
      chapter_id: chapterId,
      title: 'Neither',
    } as never);
    expect(neither.error?.message).toContain(
      'chapter_documents_file_or_minutes',
    );
  });

  it("never notes a minutes row for the assistant's document index", async () => {
    const eventId = await addEvent('Alumni board', 7);
    const meetingId = await addMinutes(eventId, 'Alumni board', 'posted');
    const documentId = await repo.fileMinutes(chapterId, meetingId);

    const { data, error } = await supabase
      .from('corpus_sources')
      .select('source_type')
      .eq('chapter_id', chapterId)
      .eq('source_id', documentId as string);
    if (error) throw error;
    expect(data).toEqual([]);
  });

  it('takes an open "Meeting Minutes" folder the chapter already keeps as its Minutes folder, and leaves a limited one alone', async () => {
    assertOk(
      'folders',
      (
        await supabase.from('chapter_document_folders').insert([
          {
            chapter_id: otherChapterId,
            name: 'Minutes',
            sort_order: 0,
            who_can_see: ['tier:00000000-0000-4000-8000-000000000001'],
          },
          {
            chapter_id: otherChapterId,
            name: 'Meeting Minutes',
            sort_order: 1,
          },
        ] as never)
      ).error,
    );
    const eventId = await addEvent('Chapter', 8, {}, otherChapterId);
    const meetingId = await addMinutes(
      eventId,
      'Chapter',
      'posted',
      otherChapterId,
    );

    await repo.fileMinutes(otherChapterId, meetingId);

    expect((await rowsOf(meetingId))[0].folder).toBe('Meeting Minutes');
    const folders = await foldersOf(otherChapterId);
    expect(
      folders.map((folder) => [folder.name, folder.minutes_series_key]),
    ).toEqual([
      ['Minutes', null],
      ['Meeting Minutes', 'root'],
    ]);
  });

  it('the sweep files every posted set that has no row, and nothing twice', async () => {
    const eventId = await addEvent('Housing', 9);
    const meetingId = await addMinutes(eventId, 'Housing', 'posted');
    expect(await rowsOf(meetingId)).toEqual([]);

    expect(await repo.fileUnfiledMinutes(500)).toBeGreaterThanOrEqual(1);
    expect(await rowsOf(meetingId)).toHaveLength(1);
    // Every posted set in these two chapters is filed now.
    const { data: posted, error } = await supabase
      .from('meetings')
      .select('id')
      .in('chapter_id', [chapterId, otherChapterId])
      .eq('status', 'posted');
    if (error) throw error;
    for (const row of posted ?? []) {
      expect(await rowsOf(row.id)).toHaveLength(1);
    }
  });
});
