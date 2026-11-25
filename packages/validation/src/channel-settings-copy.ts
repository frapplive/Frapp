import type { ChatNotificationLevel } from "./chat-notification-defaults";

/**
 * Words a channel's settings say on both apps (#6031): web's
 * `/settings?tab=chat&channel=<id>` and the phone's Channel settings screen,
 * in the shape of Discord's channel settings (Paul, 2026-11-20): the name and
 * description on top, then Access, Defaults and Moderation, then Delete
 * channel. One module, so the two pages can't drift (rulebook § 1.6).
 */
export const CHANNEL_SETTINGS_COPY = {
  name: "Name",
  description: "Description",
  /** Covers the two typed fields only; every row saves on its own. */
  save: "Save channel",
  revert: "Revert changes",
  access: "Access",
  category: "Category",
  noCategory: "No category",
  whoCanSee: "Who can see",
  whoCanPost: "Who can post",
  everyone: "Everyone",
  everyoneWhoCanSee: "Everyone who can see it",
  /** A private channel's answers: its members decide, so there is nothing to pick. */
  privateSee: "Only people added",
  privatePost: "Everyone in it",
  /** A private channel made read-only before #3722 opens to everyone in it. */
  letEveryonePost: "Let everyone in it post",
  defaults: "Defaults",
  defaultNotifications: "Default notifications",
  defaultChannel: "Chapter default channel",
  defaultChannelLine: "Chat opens here when a member has no last channel.",
  leaveOutOfActivity: "Leave out of Activity",
  leaveOutOfActivityLine: "Its sign-up links stay off Activity.",
  defaultsFootnote: "A member's own notification level always wins.",
  moderation: "Moderation",
  pinnedMessages: "Pinned messages",
  reports: "Reports",
  saved: (name: string) => `#${name} saved.`,
  saveFailed: "Couldn't save the channel.",
  nameRequired: "Name can't be empty.",
  accessIncomplete:
    "Add a tier, role or group to each chosen list, or pick Everyone.",
} as const;

/** The access group's footnote: whether the channel still follows its category. */
export function channelAccessFootnote(
  categoryName: string | null,
  matches: boolean,
): string | null {
  if (!categoryName) return null;
  return matches
    ? `Matches ${categoryName}. Changes to it reach this channel too.`
    : `Set differently from ${categoryName}.`;
}

/** The row that puts a channel back on its category's answers. */
export function matchCategoryLabel(categoryName: string): string {
  return `Match ${categoryName}`;
}

/** A channel's pinned messages as a row's value. */
export function pinnedMessagesValue(count: number): string {
  return count === 0 ? "None" : String(count);
}

/** A count of open reports as a row's value. */
export function openReportsValue(open: number): string {
  return open === 0 ? "None open" : `${open} open`;
}

/**
 * The levels an officer can set as a channel's default (#2771), in the words
 * the member's own notification menu uses for the same levels.
 */
export const CHANNEL_DEFAULT_LEVEL_LABELS: Record<
  ChatNotificationLevel,
  string
> = {
  all: "Every message",
  mentions: "Only @mentions",
  off: "Mute",
};

/** "No officer default": the channel follows its built-in level, named in it. */
export function standardLevelLabel(builtIn: ChatNotificationLevel): string {
  return `Standard (${CHANNEL_DEFAULT_LEVEL_LABELS[builtIn]})`;
}
