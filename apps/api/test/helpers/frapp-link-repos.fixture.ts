import type { Provider } from '@nestjs/common';
import { CHAPTER_REPOSITORY } from '#domain/repositories/chapter.repository.interface';
import { CHAPTER_DOCUMENT_REPOSITORY } from '#domain/repositories/chapter-document.repository.interface';
import { MEETING_REPOSITORY } from '#domain/repositories/meeting.repository.interface';
import { EVENT_REPOSITORY } from '#domain/repositories/event.repository.interface';
import {
  CHAT_CHANNEL_REPOSITORY,
  CHAT_MESSAGE_REPOSITORY,
} from '#domain/repositories/chat.repository.interface';

/**
 * Repositories `FrappLinkChecker` reads, for a test module that builds the
 * real checker: every record id a test attaches is the chapter's unless the
 * test says not (`missing`). A message's channel is `channel-of-<id>`.
 * `documents: false` / `events: false` leave those tokens to a module that
 * already provides its own. `enabledModules` is the chapter's module toggles
 * (every module on by default); `chapters: false` leaves the chapter
 * repository to the module too.
 */
export function frappLinkRepoMocks(
  options: { documents?: boolean; events?: boolean; chapters?: boolean } = {},
) {
  const missing = new Set<string>();
  const enabledModules: Record<string, boolean> = {};
  const chapterRepo = {
    findById: jest.fn(async (id: string) => ({
      id,
      enabled_modules: enabledModules,
    })),
  };
  const rows = (ids: readonly string[], chapterId: string) =>
    ids
      .filter((id) => !missing.has(id))
      .map((id) => ({ id, chapter_id: chapterId }));
  const documentRepo = {
    findByIds: jest.fn(async (ids: string[], chapterId: string) =>
      rows(ids, chapterId),
    ),
  };
  const meetingRepo = {
    findByIds: jest.fn(async (chapterId: string, ids: readonly string[]) =>
      rows(ids, chapterId),
    ),
  };
  const eventRepo = {
    findByIds: jest.fn(async (ids: readonly string[], chapterId: string) =>
      rows(ids, chapterId),
    ),
  };
  const messageRepo = {
    findById: jest.fn(async (id: string) =>
      missing.has(id)
        ? null
        : { id, channel_id: `channel-of-${id}`, is_deleted: false },
    ),
  };
  const channelRepo = {
    findByIds: jest.fn(async (chapterId: string, ids: string[]) =>
      ids.map((id) => ({ id, chapter_id: chapterId })),
    ),
  };
  const providers: Provider[] = [
    { provide: MEETING_REPOSITORY, useValue: meetingRepo },
    { provide: CHAT_MESSAGE_REPOSITORY, useValue: messageRepo },
    { provide: CHAT_CHANNEL_REPOSITORY, useValue: channelRepo },
    ...(options.chapters === false
      ? []
      : [{ provide: CHAPTER_REPOSITORY, useValue: chapterRepo }]),
    ...(options.documents === false
      ? []
      : [{ provide: CHAPTER_DOCUMENT_REPOSITORY, useValue: documentRepo }]),
    ...(options.events === false
      ? []
      : [{ provide: EVENT_REPOSITORY, useValue: eventRepo }]),
  ];
  return {
    providers,
    missing,
    enabledModules,
    chapterRepo,
    documentRepo,
    meetingRepo,
    eventRepo,
    messageRepo,
  };
}
