import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  frappLinkKey,
  isModuleEnabled,
  type FrappLink,
  type FrappRecordLinkKind,
} from '@repo/validation';
import {
  CHAPTER_REPOSITORY,
  type IChapterRepository,
} from '#domain/repositories/chapter.repository.interface';
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

const GONE: Record<FrappRecordLinkKind, string> = {
  document: "isn't one of this chapter's files any more",
  minutes: "aren't this chapter's minutes any more",
  event: "isn't on this chapter's calendar any more",
  message: "isn't in this chapter's chat any more",
};

/**
 * The module each record kind belongs to (`MODULE_CATALOG` keys). A record
 * whose module the chapter turned off can't be attached, and resolve reads it
 * as hidden, so a link never opens a door the module toggle closed. Chat has
 * no toggle.
 */
export const FRAPP_LINK_MODULES: Record<FrappRecordLinkKind, string | null> = {
  document: 'documents',
  minutes: 'meetings',
  event: 'events',
  message: null,
};

/** Whether the chapter's modules let a record of `kind` be linked. */
export function frappLinkModuleOn(
  enabledModules: Record<string, boolean> | null | undefined,
  kind: FrappRecordLinkKind,
): boolean {
  const module = FRAPP_LINK_MODULES[kind];
  return module === null || isModuleEnabled(enabledModules, module);
}

const OFF: Record<FrappRecordLinkKind, string> = {
  document: 'Chapter Files is off in this chapter, so a document',
  minutes: 'Meetings is off in this chapter, so minutes',
  event: 'Events is off in this chapter, so an event',
  message: 'A message',
};

const WHAT: Record<FrappRecordLinkKind, string> = {
  document: 'A document',
  minutes: 'Those minutes',
  event: 'An event',
  message: 'A message',
};

/**
 * The write check every list of Frapp links passes
 * (`spec/behavior/frapp-links.md`): each record newly added must be this
 * chapter's and still there, so a task or an event never starts pointing at
 * something its members can't open. One read per kind, of the ids added.
 *
 * A record the list already held (`stored`) passes unchecked: the list is
 * sent whole, and one deleted since it was attached must not block every
 * later save (it reads "Removed" on the row). A message link's channel is
 * taken from the message, never from the request, and a held one keeps the
 * channel the list already stored. A record from a module the chapter turned
 * off can't be newly added.
 *
 * Repositories only, so the event and task modules can both hold it without
 * reaching each other's services.
 */
@Injectable()
export class FrappLinkChecker {
  constructor(
    @Inject(CHAPTER_REPOSITORY)
    private readonly chapterRepo: IChapterRepository,
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
  ) {}

  async checked(
    chapterId: string,
    links: readonly FrappLink[],
    stored: readonly FrappLink[] = [],
  ): Promise<FrappLink[]> {
    const held = new Map(stored.map((link) => [frappLinkKey(link), link]));
    const added = links.filter(
      (link) => link.kind !== 'link' && !held.has(frappLinkKey(link)),
    );
    if (added.length === 0) return links.map((link) => heldAs(link, held));
    const chapter = await this.chapterRepo.findById(chapterId);
    for (const link of added) {
      if (
        link.kind !== 'link' &&
        !frappLinkModuleOn(chapter?.enabled_modules ?? null, link.kind)
      ) {
        throw new BadRequestException(`${OFF[link.kind]} can't be attached.`);
      }
    }
    const idsOf = <K extends FrappLink['kind']>(
      kind: K,
      pick: (link: Extract<FrappLink, { kind: K }>) => string,
    ): string[] => [
      ...new Set(
        added.flatMap((link) =>
          link.kind === kind
            ? [pick(link as Extract<FrappLink, { kind: K }>)]
            : [],
        ),
      ),
    ];
    const documentIds = idsOf('document', (link) => link.document_id);
    const meetingIds = idsOf('minutes', (link) => link.meeting_id);
    const eventIds = idsOf('event', (link) => link.event_id);
    const messageIds = idsOf('message', (link) => link.message_id);

    const [documents, meetings, events, messageChannels] = await Promise.all([
      documentIds.length > 0
        ? this.documentRepo.findByIds(documentIds, chapterId)
        : [],
      meetingIds.length > 0
        ? this.meetingRepo.findByIds(chapterId, meetingIds)
        : [],
      eventIds.length > 0 ? this.eventRepo.findByIds(eventIds, chapterId) : [],
      this.messageChannels(chapterId, messageIds),
    ]);
    const found = {
      document: new Set(documents.map((row) => row.id)),
      minutes: new Set(meetings.map((row) => row.id)),
      event: new Set(events.map((row) => row.id)),
    };

    return links.map((link) => {
      if (link.kind === 'link' || held.has(frappLinkKey(link))) {
        return heldAs(link, held);
      }
      const ok =
        link.kind === 'document'
          ? found.document.has(link.document_id)
          : link.kind === 'minutes'
            ? found.minutes.has(link.meeting_id)
            : link.kind === 'event'
              ? found.event.has(link.event_id)
              : messageChannels.has(link.message_id);
      if (!ok) {
        const name = `${WHAT[link.kind]} you attached`;
        const again =
          link.kind === 'document'
            ? 'Remove it, or attach it again from Chapter Files.'
            : 'Remove it.';
        throw new BadRequestException(`${name} ${GONE[link.kind]}. ${again}`);
      }
      const channelId =
        link.kind === 'message' ? messageChannels.get(link.message_id) : null;
      return link.kind === 'message' && channelId
        ? { ...link, channel_id: channelId }
        : link;
    });
  }

  /** Each live message's channel, for messages whose channel is this chapter's. */
  private async messageChannels(
    chapterId: string,
    messageIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (messageIds.length === 0) return new Map();
    const messages = (
      await Promise.all(messageIds.map((id) => this.messageRepo.findById(id)))
    ).flatMap((message) =>
      message && !message.is_deleted
        ? [{ id: message.id, channel_id: message.channel_id }]
        : [],
    );
    const channels = await this.channelRepo.findByIds(chapterId, [
      ...new Set(messages.map((message) => message.channel_id)),
    ]);
    const inChapter = new Set(
      channels
        .filter((channel) => channel.chapter_id === chapterId)
        .map((channel) => channel.id),
    );
    return new Map(
      messages
        .filter((message) => inChapter.has(message.channel_id))
        .map((message) => [message.id, message.channel_id]),
    );
  }
}

/**
 * A link the list already held, as it was stored: a message keeps the channel
 * the server took from the message when it was attached, never one a later
 * request names.
 */
function heldAs(
  link: FrappLink,
  held: ReadonlyMap<string, FrappLink>,
): FrappLink {
  if (link.kind !== 'message') return link;
  const stored = held.get(frappLinkKey(link));
  return stored?.kind === 'message'
    ? { ...link, channel_id: stored.channel_id }
    : link;
}
