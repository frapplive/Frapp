import { Inject, Injectable } from '@nestjs/common';
import {
  frappLinkKey,
  type FrappLinkResolved,
  type FrappLinkTarget,
} from '@repo/validation';
import {
  CHAPTER_DOCUMENT_REPOSITORY,
  type IChapterDocumentRepository,
} from '#domain/repositories/chapter-document.repository.interface';
import {
  MEETING_REPOSITORY,
  type IMeetingRepository,
} from '#domain/repositories/meeting.repository.interface';
import {
  EVENT_REPOSITORY,
  type IEventRepository,
} from '#domain/repositories/event.repository.interface';
import {
  CHAT_CHANNEL_REPOSITORY,
  CHAT_MESSAGE_REPOSITORY,
  type IChatChannelRepository,
  type IChatMessageRepository,
} from '#domain/repositories/chat.repository.interface';
import {
  USER_REPOSITORY,
  type IUserRepository,
} from '#domain/repositories/user.repository.interface';
import { ChapterDocumentService } from '../chapter-document.service';
import { MeetingService } from '../meeting.service';
import { EventService } from '../event.service';
import { ChannelAccessService } from '../channel-access.service';

type Ids = { [K in FrappLinkTarget['kind']]: string[] };

function removed(key: string): FrappLinkResolved {
  return { key, state: 'removed', title: null, date: null, author: null };
}

function hidden(key: string): FrappLinkResolved {
  return { key, state: 'hidden', title: null, date: null, author: null };
}

/**
 * What each Frapp link names, for the member asking
 * (`spec/behavior/frapp-links.md`): the record's live name and date when they
 * may open it, `hidden` with no name when they may not, `removed` when it is
 * gone or was never this chapter's. Each kind is read by its own feature's
 * rule (Documents' lists, minutes' event audience, the event list's rule,
 * channel access), never a rule of its own, so a link shows exactly what the
 * member would see opening the record.
 */
@Injectable()
export class FrappLinkService {
  constructor(
    private readonly documents: ChapterDocumentService,
    private readonly meetings: MeetingService,
    private readonly events: EventService,
    private readonly channelAccess: ChannelAccessService,
    @Inject(CHAPTER_DOCUMENT_REPOSITORY)
    private readonly documentRepo: IChapterDocumentRepository,
    @Inject(MEETING_REPOSITORY)
    private readonly meetingRepo: IMeetingRepository,
    @Inject(EVENT_REPOSITORY)
    private readonly eventRepo: IEventRepository,
    @Inject(CHAT_MESSAGE_REPOSITORY)
    private readonly messageRepo: IChatMessageRepository,
    @Inject(CHAT_CHANNEL_REPOSITORY)
    private readonly channelRepo: IChatChannelRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
  ) {}

  /** One answer per distinct target, in the order first asked. */
  async resolve(
    chapterId: string,
    userId: string,
    targets: readonly FrappLinkTarget[],
  ): Promise<FrappLinkResolved[]> {
    const unique = new Map<string, FrappLinkTarget>();
    for (const target of targets) {
      const key = frappLinkKey(target);
      if (!unique.has(key)) unique.set(key, target);
    }
    const ids: Ids = { document: [], minutes: [], event: [], message: [] };
    for (const target of unique.values()) {
      switch (target.kind) {
        case 'document':
          ids.document.push(target.document_id);
          break;
        case 'minutes':
          ids.minutes.push(target.meeting_id);
          break;
        case 'event':
          ids.event.push(target.event_id);
          break;
        case 'message':
          ids.message.push(target.message_id);
          break;
      }
    }
    const answers = new Map<string, FrappLinkResolved>();
    const parts = await Promise.all([
      this.resolveDocuments(chapterId, userId, ids.document),
      this.resolveMinutes(chapterId, userId, ids.minutes),
      this.resolveEvents(chapterId, userId, ids.event),
      this.resolveMessages(chapterId, userId, ids.message),
    ]);
    for (const part of parts) {
      for (const answer of part) answers.set(answer.key, answer);
    }
    return [...unique.keys()].map((key) => answers.get(key) ?? removed(key));
  }

  private async resolveDocuments(
    chapterId: string,
    userId: string,
    ids: string[],
  ): Promise<FrappLinkResolved[]> {
    if (ids.length === 0) return [];
    const rows = await this.documentRepo.findByIds(ids, chapterId);
    const visible = new Set(
      (await this.documents.visibleTo(chapterId, userId, rows)).map(
        (row) => row.id,
      ),
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => {
      const key = `document:${id}`;
      const row = byId.get(id);
      if (!row) return removed(key);
      if (!visible.has(id)) return hidden(key);
      return { key, state: 'ok', title: row.title, date: null, author: null };
    });
  }

  private async resolveMinutes(
    chapterId: string,
    userId: string,
    ids: string[],
  ): Promise<FrappLinkResolved[]> {
    if (ids.length === 0) return [];
    const [rows, readable] = await Promise.all([
      this.meetingRepo.findByIds(chapterId, ids),
      this.meetings.readableAmong(chapterId, userId, ids),
    ]);
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => {
      const key = `minutes:${id}`;
      const row = byId.get(id);
      if (!row) return removed(key);
      if (!readable.has(id)) return hidden(key);
      return {
        key,
        state: 'ok',
        title: row.event_name,
        date: row.event_start_time,
        author: null,
      };
    });
  }

  private async resolveEvents(
    chapterId: string,
    userId: string,
    ids: string[],
  ): Promise<FrappLinkResolved[]> {
    if (ids.length === 0) return [];
    const rows = await this.eventRepo.findByIds(ids, chapterId);
    const visible = new Set(
      (await this.events.findVisibleByIds(ids, chapterId, userId)).map(
        (row) => row.id,
      ),
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => {
      const key = `event:${id}`;
      const row = byId.get(id);
      if (!row) return removed(key);
      if (!visible.has(id)) return hidden(key);
      return {
        key,
        state: 'ok',
        title: row.name,
        date: row.start_time,
        author: null,
      };
    });
  }

  private async resolveMessages(
    chapterId: string,
    userId: string,
    ids: string[],
  ): Promise<FrappLinkResolved[]> {
    if (ids.length === 0) return [];
    const messages = (
      await Promise.all(ids.map((id) => this.messageRepo.findById(id)))
    ).flatMap((message) => (message && !message.is_deleted ? [message] : []));
    const channelIds = [...new Set(messages.map((m) => m.channel_id))];
    const [channels, readable] = await Promise.all([
      this.channelRepo.findByIds(chapterId, channelIds),
      this.channelAccess.filterAccessibleChannelIds(
        chapterId,
        userId,
        channelIds,
        { includeArchived: true },
      ),
    ]);
    const channelById = new Map(
      channels
        .filter((channel) => channel.chapter_id === chapterId)
        .map((channel) => [channel.id, channel]),
    );
    const senderIds = [
      ...new Set(
        messages.flatMap((m) =>
          m.sender_id && readable.has(m.channel_id) ? [m.sender_id] : [],
        ),
      ),
    ];
    const senders = new Map(
      (senderIds.length > 0
        ? await this.userRepo.findByIds(senderIds)
        : []
      ).map((user) => [user.id, user.display_name]),
    );
    const byId = new Map(messages.map((message) => [message.id, message]));
    return ids.map((id) => {
      const key = `message:${id}`;
      const message = byId.get(id);
      const channel = message ? channelById.get(message.channel_id) : undefined;
      if (!message || !channel) return removed(key);
      if (!readable.has(channel.id)) return hidden(key);
      return {
        key,
        state: 'ok',
        title: channel.name,
        date: message.created_at,
        author:
          (message.sender_id ? senders.get(message.sender_id) : null) ??
          message.author_name ??
          null,
      };
    });
  }
}
