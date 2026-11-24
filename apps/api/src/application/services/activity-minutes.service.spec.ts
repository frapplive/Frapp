import { SystemPermissions } from '#domain/constants/permissions';
import type { Event } from '#domain/entities/event.entity';
import type { Meeting } from '#domain/entities/meeting.entity';
import { ActivityMinutesService } from './activity-minutes.service';
import type { MeetingListFacts } from './meeting.service';

const CHAPTER = 'chapter-1';
const ME = 'user-me';
const OTHER = 'user-other';
const NOW = new Date('2026-11-24T18:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;
const RECORDER = [
  SystemPermissions.MEMBERS_VIEW,
  SystemPermissions.MEETINGS_RECORD,
];

const event = (id: string, name: string, daysAgo: number): Event =>
  ({
    id,
    chapter_id: CHAPTER,
    name,
    start_time: new Date(NOW - daysAgo * DAY).toISOString(),
    end_time: new Date(NOW - daysAgo * DAY + 60 * 60 * 1000).toISOString(),
  }) as Event;

const draft = (id: string, overrides: Partial<Meeting> = {}): Meeting =>
  ({
    id,
    chapter_id: CHAPTER,
    event_id: `event-${id}`,
    event_name: 'Exec meeting',
    event_start_time: new Date(NOW - DAY).toISOString(),
    status: 'draft',
    created_by: ME,
    ...overrides,
  }) as Meeting;

const facts = (
  overrides: Partial<MeetingListFacts> = {},
): MeetingListFacts => ({
  series_key: null,
  series_rule: null,
  decision_count: 0,
  action_item_count: 0,
  recorded: false,
  gist: null,
  started: true,
  recording_by: null,
  ...overrides,
});

/** Another officer's draft, as `draftsVisibleTo` gives it. */
const othersDraft = (id: string, daysAgo = 1): Meeting =>
  draft(id, {
    event_name: 'Recruitment Committee',
    event_start_time: new Date(NOW - daysAgo * DAY).toISOString(),
    meeting_type: 'committee',
    created_by: OTHER,
  });

/** The member's own notes row on a draft: added by its author, or not. */
const notesRow = (meetingId: string, added: boolean) => ({
  chapter_id: CHAPTER,
  meeting_id: meetingId,
  user_id: ME,
  notes: '',
  added_by: added ? OTHER : null,
});

function build() {
  const events = { findByChapter: jest.fn().mockResolvedValue([]) };
  const meetings = {
    eventIdsWithMinutes: jest.fn().mockResolvedValue(new Set()),
    ownDrafts: jest.fn().mockResolvedValue({ rows: [], facts: new Map() }),
    draftsVisibleTo: jest.fn().mockResolvedValue([]),
  };
  const noMinutes = { listFor: jest.fn().mockResolvedValue([]) };
  const notes = { findByUser: jest.fn().mockResolvedValue([]) };
  const memberRepo = {
    findChapterMemberIdentities: jest.fn().mockResolvedValue([
      { user_id: ME, display_name: 'Me Member' },
      { user_id: OTHER, display_name: 'Other Member' },
    ]),
  };
  const userRepo = {
    findDisplayIdentitiesByIds: jest
      .fn()
      .mockResolvedValue([
        { id: OTHER, display_name: 'Other Member', avatar_url: null },
      ]),
  };
  const service = new ActivityMinutesService(
    events as never,
    meetings as never,
    noMinutes as never,
    notes as never,
    memberRepo as never,
    userRepo as never,
  );
  return { service, events, meetings, noMinutes, notes, userRepo };
}

describe('ActivityMinutesService (#5949)', () => {
  const ai = process.env.AI_ENABLED;
  beforeEach(() => {
    process.env.AI_ENABLED = 'true';
  });
  afterAll(() => {
    if (ai === undefined) delete process.env.AI_ENABLED;
    else process.env.AI_ENABLED = ai;
  });

  describe('to write', () => {
    it('lists the meetings the member can see that ended with no minutes, newest first', async () => {
      const { service, events } = build();
      events.findByChapter.mockResolvedValue([
        event('older', 'Chapter meeting', 6),
        event('newer', 'Exec Board', 2),
        // A social never asks for minutes.
        event('formal', 'Chapter Formal', 3),
        // Past the 30 days.
        event('stale', 'Chapter meeting', 40),
      ]);

      const minutes = await service.listFor(CHAPTER, ME, RECORDER, NOW);

      expect(minutes.to_write.map((row) => row.event_id)).toEqual([
        'newer',
        'older',
      ]);
      expect(minutes.to_write[0]).toEqual({
        event_id: 'newer',
        name: 'Exec Board',
        start_time: new Date(NOW - 2 * DAY).toISOString(),
        end_time: new Date(NOW - 2 * DAY + 60 * 60 * 1000).toISOString(),
      });
    });

    it('reads the calendar as the member, so an event they can’t see is never listed', async () => {
      const { service, events } = build();

      await service.listFor(CHAPTER, ME, RECORDER, NOW);

      // The event read rule is `EventService.findByChapter` with the viewer:
      // whatever it leaves out of the member's calendar never reaches a row.
      expect(events.findByChapter).toHaveBeenCalledWith(CHAPTER, ME, {
        endsAfter: new Date(NOW - 30 * DAY).toISOString(),
        startsBefore: new Date(NOW).toISOString(),
      });
    });

    it('leaves out a meeting with minutes by anyone, a draft the member can’t read included', async () => {
      const { service, events, meetings } = build();
      events.findByChapter.mockResolvedValue([
        event('theirs', 'Chapter meeting', 2),
        event('open', 'Exec meeting', 3),
      ]);
      // Another officer's draft: only its existence is asked.
      meetings.eventIdsWithMinutes.mockResolvedValue(new Set(['theirs']));

      const minutes = await service.listFor(CHAPTER, ME, RECORDER, NOW);

      expect(meetings.eventIdsWithMinutes).toHaveBeenCalledWith(CHAPTER, [
        'theirs',
        'open',
      ]);
      expect(minutes.to_write.map((row) => row.event_id)).toEqual(['open']);
    });

    it('leaves out a meeting marked "No minutes"', async () => {
      const { service, events, noMinutes } = build();
      events.findByChapter.mockResolvedValue([
        event('marked', 'Chapter meeting', 2),
        event('open', 'Exec meeting', 3),
      ]);
      noMinutes.listFor.mockResolvedValue([{ event_id: 'marked' }]);

      const minutes = await service.listFor(CHAPTER, ME, RECORDER, NOW);

      // Only the meetings in the window, not the chapter's whole history.
      expect(noMinutes.listFor).toHaveBeenCalledWith(
        CHAPTER,
        expect.arrayContaining(['marked', 'open']),
      );
      expect(minutes.to_write.map((row) => row.event_id)).toEqual(['open']);
    });

    it('gives a member without meetings:record no rows to write, and reads no calendar for them', async () => {
      const { service, events, meetings, noMinutes } = build();
      events.findByChapter.mockResolvedValue([
        event('open', 'Chapter meeting', 2),
      ]);

      const minutes = await service.listFor(
        CHAPTER,
        ME,
        [SystemPermissions.MEMBERS_VIEW],
        NOW,
      );

      expect(minutes.to_write).toEqual([]);
      expect(events.findByChapter).not.toHaveBeenCalled();
      expect(meetings.eventIdsWithMinutes).not.toHaveBeenCalled();
      expect(noMinutes.listFor).not.toHaveBeenCalled();
    });

    it('asks nothing more when no meeting ended in the window', async () => {
      const { service, meetings, noMinutes } = build();

      const minutes = await service.listFor(CHAPTER, ME, RECORDER, NOW);

      expect(minutes.to_write).toEqual([]);
      expect(meetings.eventIdsWithMinutes).not.toHaveBeenCalled();
      expect(noMinutes.listFor).not.toHaveBeenCalled();
    });
  });

  describe('drafts', () => {
    it('lists the member’s own drafts with where each stands, naming another member recording it', async () => {
      const { service, meetings, userRepo } = build();
      meetings.ownDrafts.mockResolvedValue({
        rows: [draft('mine'), draft('recorded'), draft('untouched')],
        facts: new Map([
          ['mine', facts({ recording_by: ME })],
          ['recorded', facts({ recording_by: OTHER })],
          ['untouched', facts({ started: false })],
        ]),
      });

      const minutes = await service.listFor(
        CHAPTER,
        ME,
        [SystemPermissions.MEMBERS_VIEW],
        NOW,
      );

      expect(meetings.ownDrafts).toHaveBeenCalledWith(CHAPTER, ME, 50);
      expect(userRepo.findDisplayIdentitiesByIds).toHaveBeenCalledWith([OTHER]);
      expect(
        minutes.drafts.map((row) => [
          row.meeting_id,
          row.started,
          row.recording_by,
          row.recording_by_name,
        ]),
      ).toEqual([
        ['mine', true, ME, null],
        ['recorded', true, OTHER, 'Other Member'],
        ['untouched', false, null, null],
      ]);
    });
  });

  describe('taking notes', () => {
    it('lists the drafts the member was added to or joined, newest meeting first', async () => {
      const { service, meetings, notes } = build();
      meetings.draftsVisibleTo.mockResolvedValue([
        othersDraft('older', 5),
        // An officer who records minutes may join any draft; one they have
        // no notes on waits on nobody.
        othersDraft('open', 2),
        othersDraft('newer', 1),
        // The member's own draft is under drafts, not here.
        draft('mine'),
        // Notes are never taken on Standards minutes.
        draft('standards', {
          created_by: OTHER,
          meeting_type: 'standards' as Meeting['meeting_type'],
        }),
      ]);
      notes.findByUser.mockResolvedValue([
        notesRow('older', false),
        notesRow('newer', true),
        notesRow('mine', false),
        notesRow('standards', true),
      ]);

      const minutes = await service.listFor(CHAPTER, ME, RECORDER, NOW);

      expect(meetings.draftsVisibleTo).toHaveBeenCalledWith(CHAPTER, ME);
      expect(minutes.taking_notes.map((row) => row.meeting_id)).toEqual([
        'newer',
        'older',
      ]);
      expect(minutes.taking_notes[0]).toEqual({
        meeting_id: 'newer',
        event_id: 'event-newer',
        name: 'Recruitment Committee',
        event_start_time: new Date(NOW - DAY).toISOString(),
        author_name: 'Other Member',
        joined: true,
        added: true,
      });
    });

    it('lists only what a member without meetings:record was added to', async () => {
      const { service, meetings, notes } = build();
      meetings.draftsVisibleTo.mockResolvedValue([
        othersDraft('added'),
        othersDraft('joined'),
      ]);
      // A notes row nobody added them to: they could join only while they
      // recorded minutes.
      notes.findByUser.mockResolvedValue([
        notesRow('added', true),
        notesRow('joined', false),
      ]);

      const minutes = await service.listFor(
        CHAPTER,
        ME,
        [SystemPermissions.MEMBERS_VIEW],
        NOW,
      );

      expect(minutes.taking_notes.map((row) => row.meeting_id)).toEqual([
        'added',
      ]);
    });

    it('reads no drafts when the member has no notes anywhere, and none for an editor', async () => {
      const { service, meetings, notes } = build();

      await service.listFor(CHAPTER, ME, RECORDER, NOW);
      expect(meetings.draftsVisibleTo).not.toHaveBeenCalled();

      notes.findByUser.mockResolvedValue([notesRow('added', true)]);
      const minutes = await service.listFor(
        CHAPTER,
        ME,
        [...RECORDER, SystemPermissions.MEETINGS_EDIT],
        NOW,
      );
      expect(minutes.taking_notes).toEqual([]);
      expect(meetings.draftsVisibleTo).not.toHaveBeenCalled();
    });

    it('reads no note-taking on a server with AI off, where its routes don’t exist', async () => {
      process.env.AI_ENABLED = 'false';
      const { service, notes } = build();
      notes.findByUser.mockResolvedValue([notesRow('added', true)]);

      const minutes = await service.listFor(CHAPTER, ME, RECORDER, NOW);

      expect(notes.findByUser).not.toHaveBeenCalled();
      expect(minutes.taking_notes).toEqual([]);
    });
  });
});
