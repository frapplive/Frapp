import { Inject, Injectable } from '@nestjs/common';
import { NEEDS_MINUTES_DAYS, can, minutesToWrite } from '@repo/validation';
import { SystemPermissions } from '#domain/constants/permissions';
import { isAiEnabled } from '#domain/utils/ai-enabled';
import { MEETING_NO_MINUTES_REPOSITORY } from '#domain/repositories/meeting-no-minutes.repository.interface';
import type { IMeetingNoMinutesRepository } from '#domain/repositories/meeting-no-minutes.repository.interface';
import { MEETING_NOTES_REPOSITORY } from '#domain/repositories/meeting-notes.repository.interface';
import type { IMeetingNotesRepository } from '#domain/repositories/meeting-notes.repository.interface';
import { MEMBER_REPOSITORY } from '#domain/repositories/member.repository.interface';
import type { IMemberRepository } from '#domain/repositories/member.repository.interface';
import { USER_REPOSITORY } from '#domain/repositories/user.repository.interface';
import type { IUserRepository } from '#domain/repositories/user.repository.interface';
import { displayNamesById } from './display-names';
import { EventService } from './event.service';
import { noteTakingRows } from './meeting-notes.service';
import { MeetingService } from './meeting.service';

/**
 * A meeting on the calendar that ended in the last 30 days with no minutes
 * (#5949): Activity's Write minutes row, for a holder of `meetings:record`.
 */
export interface ActivityMinutesToWrite {
  event_id: string;
  name: string;
  start_time: string;
  end_time: string;
}

/** Minutes the caller started and hasn't posted (#5949). */
export interface ActivityMinutesDraft {
  meeting_id: string;
  /** Null for minutes started with no meeting, until one is linked. */
  event_id: string | null;
  /** The meeting's name as the minutes hold it. */
  name: string;
  event_start_time: string;
  /** Whether anything is in them yet (`MeetingListFacts.started`). */
  started: boolean;
  /** Who is recording them on their phone right now, else null. */
  recording_by: string | null;
  /** That member's name, when it isn't the caller; else null. */
  recording_by_name: string | null;
}

/**
 * Another officer's unposted minutes the caller takes notes on: one they
 * were added to, or joined by writing (#4935, #5949).
 */
export interface ActivityNoteTaking {
  meeting_id: string;
  event_id: string;
  name: string;
  event_start_time: string;
  /** Who is writing the minutes. */
  author_name: string;
  /** They have notes on it already. */
  joined: boolean;
  /** The author or an editor added them. */
  added: boolean;
}

/** Activity's minutes rows (#5949, `spec/behavior/activity.md` § Minutes). */
export interface ActivityMinutes {
  to_write: ActivityMinutesToWrite[];
  drafts: ActivityMinutesDraft[];
  taking_notes: ActivityNoteTaking[];
}

/** The caller's own drafts read at most; a secretary keeps a handful. */
const DRAFT_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The minutes waiting on the caller, for Activity's To do (#5949; Paul,
 * 2026-11-24: the Meetings list page is gone, so what it asked of an officer
 * lives here). Each list goes through the rule that already owns it:
 *
 * - **To write** (only for `meetings:record`): the events the caller can see
 *   (`EventService.findByChapter` with the viewer) that ended in the last
 *   `NEEDS_MINUTES_DAYS` days and whose name reads as a meeting
 *   (`minutesToWrite`), less those with minutes by anyone, a draft the
 *   caller can't read included (`MeetingService.eventIdsWithMinutes`), and
 *   those marked "No minutes" (`meeting_no_minutes`; the events are already
 *   the caller's, so the marks need no read rule of their own).
 * - **Drafts**: the caller's own unposted minutes they may still read
 *   (`MeetingService.ownDrafts`).
 * - **Taking notes**: other officers' drafts the caller is a note-taker on,
 *   added or joined, by note-taking's own rule (`noteTakingRows`, which
 *   `MeetingNotesService.listForUser` applies too), on a server with AI on,
 *   where note-taking's routes exist.
 *
 * It reads the two meetings tables through their repositories, as this
 * module does the chat ones, rather than importing their feature modules:
 * an import would move those modules' routes in the OpenAPI document. The
 * caller's module check is `ActivityService`'s: it asks only while the
 * chapter has Meetings on.
 */
@Injectable()
export class ActivityMinutesService {
  constructor(
    private readonly events: EventService,
    private readonly meetings: MeetingService,
    @Inject(MEETING_NO_MINUTES_REPOSITORY)
    private readonly noMinutes: IMeetingNoMinutesRepository,
    @Inject(MEETING_NOTES_REPOSITORY)
    private readonly notes: IMeetingNotesRepository,
    @Inject(MEMBER_REPOSITORY) private readonly memberRepo: IMemberRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
  ) {}

  async listFor(
    chapterId: string,
    userId: string,
    permissions: readonly string[],
    now: number,
  ): Promise<ActivityMinutes> {
    const [toWrite, drafts, takingNotes] = await Promise.all([
      can(SystemPermissions.MEETINGS_RECORD, permissions)
        ? this.toWrite(chapterId, userId, now)
        : Promise.resolve([]),
      this.drafts(chapterId, userId),
      isAiEnabled()
        ? this.takingNotes(chapterId, userId, permissions)
        : Promise.resolve([]),
    ]);
    return { to_write: toWrite, drafts, taking_notes: takingNotes };
  }

  private async toWrite(
    chapterId: string,
    userId: string,
    now: number,
  ): Promise<ActivityMinutesToWrite[]> {
    const events = await this.events.findByChapter(chapterId, userId, {
      endsAfter: new Date(now - NEEDS_MINUTES_DAYS * DAY_MS).toISOString(),
      startsBefore: new Date(now).toISOString(),
    });
    // The meetings that ended in the window, newest first, before asking
    // which have minutes, so that read names only these.
    const ended = minutesToWrite(events, new Set(), now).needs;
    if (ended.length === 0) return [];
    const [started, marked] = await Promise.all([
      this.meetings.eventIdsWithMinutes(
        chapterId,
        ended.map((event) => event.id),
      ),
      this.noMinutes.list(chapterId),
    ]);
    const skipped = new Set(marked.map((mark) => mark.event_id));
    return ended
      .filter((event) => !started.has(event.id) && !skipped.has(event.id))
      .map((event) => ({
        event_id: event.id,
        name: event.name,
        start_time: event.start_time,
        end_time: event.end_time ?? event.start_time,
      }));
  }

  private async drafts(
    chapterId: string,
    userId: string,
  ): Promise<ActivityMinutesDraft[]> {
    const { rows, facts } = await this.meetings.ownDrafts(
      chapterId,
      userId,
      DRAFT_LIMIT,
    );
    const recorders = rows.flatMap((row) => {
      const by = facts.get(row.id)?.recording_by;
      return by && by !== userId ? [by] : [];
    });
    const names = await displayNamesById(this.userRepo, recorders);
    return rows.map((row) => {
      const fact = facts.get(row.id);
      const recordingBy = fact?.recording_by ?? null;
      return {
        meeting_id: row.id,
        event_id: row.event_id,
        name: row.event_name,
        event_start_time: row.event_start_time,
        started: fact?.started ?? false,
        recording_by: recordingBy,
        recording_by_name:
          recordingBy && recordingBy !== userId
            ? names.get(recordingBy) || null
            : null,
      };
    });
  }

  private async takingNotes(
    chapterId: string,
    userId: string,
    permissions: readonly string[],
  ): Promise<ActivityNoteTaking[]> {
    // An editor opens every draft as its editor, so takes notes on none.
    if (can(SystemPermissions.MEETINGS_EDIT, permissions)) return [];
    // Only minutes the member has notes on (added, or joined by writing)
    // wait on them, so with none there is nothing to read.
    const mine = await this.notes.findByUser(chapterId, userId);
    if (mine.length === 0) return [];
    const [drafts, identities] = await Promise.all([
      this.meetings.draftsVisibleTo(chapterId, userId),
      this.memberRepo.findChapterMemberIdentities(chapterId),
    ]);
    const rows = noteTakingRows({
      userId,
      canRecord: can(SystemPermissions.MEETINGS_RECORD, permissions),
      drafts,
      mine,
      identities,
    });
    return (
      rows
        // An officer who records minutes may join any draft; only the ones
        // they are in wait on them.
        .filter((row) => row.joined || row.added)
        .sort(
          (a, b) =>
            Date.parse(b.event_start_time) - Date.parse(a.event_start_time),
        )
        .map((row) => ({
          meeting_id: row.meeting_id,
          event_id: row.event_id,
          name: row.event_name,
          event_start_time: row.event_start_time,
          author_name: row.author_name,
          joined: row.joined,
          added: row.added,
        }))
    );
  }
}
