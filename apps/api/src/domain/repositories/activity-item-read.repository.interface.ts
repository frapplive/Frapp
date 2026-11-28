import type {
  ActivityItemKind,
  ActivityItemRead,
  ActivityItemSnooze,
} from '../entities/activity-item-read.entity';
import type { ChatMessage } from '../entities/chat.entity';
import type { StoredChatMessageReminder } from './chat-message-reminder.repository.interface';

export const ACTIVITY_ITEM_READ_REPOSITORY = 'ACTIVITY_ITEM_READ_REPOSITORY';

/** One Activity item, by its module's kind and id. */
export interface ActivityItemRef {
  kind: ActivityItemKind;
  item_id: string;
}

/**
 * What `GET /v1/activity` reads beside its tasks and events, in one round
 * trip (`activity_page_reads`, #6061 step 2): the chat cards it lists, the
 * caller's reminders, and the caller's snoozes and unread start. Each list is
 * filtered, ordered and capped in SQL as its own read was. The cards are the
 * chapter's; which of them the caller may see is still the API's decision
 * (the channel list and the block list).
 */
export interface ActivityPageReads {
  /** The chapter's newest polls; empty when polls weren't asked for. */
  polls: ChatMessage[];
  /** The caller's own newest polls; empty when polls weren't asked for. */
  own_polls: ChatMessage[];
  /** The chapter's newest sign-up sheets and headcounts. */
  signups: ChatMessage[];
  /** The chapter's newest forms. */
  forms: ChatMessage[];
  /**
   * The caller's latest due reminders, latest first, then their soonest
   * waiting ones, soonest first, each `limit` long at most.
   */
  reminders: StoredChatMessageReminder[];
  /** The caller's snoozes that end after `snoozesEndedAfter`. */
  snoozes: ActivityItemSnooze[];
  /** When the caller's unread dots began; null when they haven't. */
  unread_since: string | null;
}

/**
 * Which Activity items each member opened, and when, and when their unread
 * dots began (#4173, `spec/behavior/activity.md` § Unread), and what they
 * snoozed (#4982). Every method is scoped by chapter and member: this state is
 * the member's own and nobody else ever reads it. {@link readPage} also reads
 * the chapter's chat cards, so Activity's page costs one request for both.
 */
export interface IActivityItemReadRepository {
  /**
   * Everything {@link ActivityPageReads} names, for one member in one
   * chapter, in one request. `polls: false` leaves both poll lists empty.
   */
  readPage(
    chapterId: string,
    userId: string,
    query: {
      now: string;
      snoozesEndedAfter: string;
      polls: boolean;
      pollLimit: number;
      cardLimit: number;
      reminderLimit: number;
    },
  ): Promise<ActivityPageReads>;
  /** Begins the member's dots at `startedAt`, unless they already began. */
  startUnread(
    chapterId: string,
    userId: string,
    startedAt: string,
  ): Promise<void>;
  /**
   * The member's reads in the chapter of any item whose id is in `itemIds`,
   * whatever its kind. An empty `itemIds` reads nothing.
   */
  findReads(
    chapterId: string,
    userId: string,
    itemIds: string[],
  ): Promise<ActivityItemRead[]>;
  /** Records that the member opened these items now. Idempotent. */
  markRead(
    chapterId: string,
    userId: string,
    items: ActivityItemRef[],
    readAt: string,
  ): Promise<void>;
  /** Snoozes the item until `until`, replacing any snooze it had. */
  snooze(
    chapterId: string,
    userId: string,
    item: ActivityItemRef,
    until: string,
  ): Promise<void>;
  /** Drops the member's snooze of the item, if any. Idempotent. */
  unsnooze(
    chapterId: string,
    userId: string,
    item: ActivityItemRef,
  ): Promise<void>;
}
