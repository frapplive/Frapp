import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  CHAPTER_DOCUMENT_REPOSITORY,
  type IChapterDocumentRepository,
} from '#domain/repositories/chapter-document.repository.interface';
import { MeetingService } from './meeting.service';

/**
 * Files a meeting's posted minutes as a document (#5949; Paul, 2026-11-24:
 * "File minutes as documents"; `spec/behavior/chapter-docs.md` § Minutes), so
 * Documents lists them beside the chapter's files.
 *
 * The row holds no text and no audience. Where it is filed (the chapter's
 * Minutes folder, or its repeating meeting's own folder under it) and what it
 * is named are the database's `file_minutes_document`, one transaction, so
 * two posts never make a folder twice. Who sees it is the meeting's own rule,
 * read each time by `ChapterDocumentService` through
 * `MeetingService.readablePosted`; nothing here copies it.
 *
 * Minutes are filed when they post, and their row follows the meeting's name
 * on each later save. A filing that fails never fails the post
 * (`MeetingService.onPostedMinutesSaved`); the sweep
 * (`MinutesDocumentSweepService`) files what a failure left behind, and the
 * minutes posted before this existed. Deleting minutes removes their row with
 * them (the link's `on delete cascade`).
 */
@Injectable()
export class MinutesDocumentService implements OnModuleInit {
  constructor(
    private readonly meetings: MeetingService,
    @Inject(CHAPTER_DOCUMENT_REPOSITORY)
    private readonly documents: IChapterDocumentRepository,
  ) {}

  onModuleInit(): void {
    this.meetings.onPostedMinutesSaved(async (meeting) => {
      await this.documents.fileMinutes(meeting.chapter_id, meeting.id);
    });
  }

  /** Files up to `limit` posted minutes that have no row yet; how many. */
  fileUnfiled(limit: number): Promise<number> {
    return this.documents.fileUnfiledMinutes(limit);
  }
}
