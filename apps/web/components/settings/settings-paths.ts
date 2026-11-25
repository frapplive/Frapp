/**
 * Where the officer tools live on web: inside Chapter settings, on the page
 * of the module each belongs to (#3837).
 *
 * Chat admin, Discord import, Study zones and Reports each had a full-width
 * route of their own, and opening one from Chapter settings dropped the rail
 * and brought chat back beside it (Paul, 2026-11-12: "I DO NOT WANT" that,
 * "phase those out"). Their old routes only redirect here now, so anything
 * that links to a tool links to one of these instead of bouncing through the
 * redirect, which would lose a `#reported-messages` anchor on the way.
 */

/** The Chat page: channels, categories, background and the report queue. */
export const CHAT_SETTINGS_PATH = "/settings?tab=chat";

/**
 * The pages a channel's rows open (#6031), each with a way back to the
 * channel: one question of its access, its pins, the reports filed in it.
 */
export const CHANNEL_SETTINGS_PAGES = [
  "see",
  "post",
  "pins",
  "reports",
] as const;
export type ChannelSettingsPage = (typeof CHANNEL_SETTINGS_PAGES)[number];

function isChannelSettingsPage(
  value: string | null | undefined,
): value is ChannelSettingsPage {
  return (CHANNEL_SETTINGS_PAGES as readonly string[]).includes(value ?? "");
}

/** One channel's own settings, opened in place of the Chat page, or one of its pages. */
export function channelSettingsPath(
  channelId: string,
  page: ChannelSettingsPage | null = null,
): string {
  const channel = `${CHAT_SETTINGS_PATH}&channel=${encodeURIComponent(channelId)}`;
  return page ? `${channel}&page=${page}` : channel;
}

/**
 * The pages the Chat page's own rows open (#6031): the chapter's chat
 * background and the whole report queue.
 */
export const CHAT_SETTINGS_PAGES = ["background", "reports"] as const;
export type ChatSettingsPage = (typeof CHAT_SETTINGS_PAGES)[number];

function isChatSettingsPage(
  value: string | null | undefined,
): value is ChatSettingsPage {
  return (CHAT_SETTINGS_PAGES as readonly string[]).includes(value ?? "");
}

/** One of the Chat page's own pages. */
export function chatSettingsPagePath(page: ChatSettingsPage): string {
  return `${CHAT_SETTINGS_PATH}&page=${page}`;
}

/**
 * The anchor a new-report link carried before the queue had a page of its
 * own (#6031). A Chat page address with it still opens the queue's page.
 */
export const CHAT_REPORTS_ANCHOR = "reported-messages";

/** The report queue, where a new-report notification lands. */
export const CHAT_REPORTS_SETTINGS_PATH = chatSettingsPagePath("reports");

/** `?tool=` value that opens Discord import in place of the Chat page. */
const DISCORD_IMPORT_TOOL = "discord-import";

/** Discord import, opened in place of the Chat page. */
export const DISCORD_IMPORT_SETTINGS_PATH = `${CHAT_SETTINGS_PATH}&tool=${DISCORD_IMPORT_TOOL}`;

/** The Reports page, whose body is the export form. */
export const REPORTS_SETTINGS_PATH = "/settings?tab=reports";

/** The Points page, whose body is the chapter's points ledger (#5950). */
export const POINTS_SETTINGS_PATH = "/settings?tab=points";

/** `?member=` narrows the ledger to one member's transactions. */
export const LEDGER_MEMBER_PARAM = "member";

/** The ledger on one member, from the Points row on their card. */
export function pointsLedgerPath(userId: string): string {
  return `${POINTS_SETTINGS_PATH}&${LEDGER_MEMBER_PARAM}=${encodeURIComponent(userId)}`;
}

/** The Service hours page, whose body is the chapter's reviewed entries (#5950). */
export const HOURS_SETTINGS_PATH = "/settings?tab=hours";

/** The Study zones page, whose body is the zone list. */
export const STUDY_ZONES_SETTINGS_PATH = "/settings?tab=geofences";

/**
 * Search params that open a page inside a module page (a channel's settings,
 * Discord import). Switching rail rows drops them, so coming back to Chat
 * shows the Chat page rather than the sub-page last left open.
 */
export const SETTINGS_SUBPAGE_PARAMS = [
  "channel",
  "tool",
  // Discord's way back from its consent screen, and its one-time outcome.
  "wizard",
  "discord",
  "handshake",
  // Consumed once by the module page's switch focus (#492).
  "module",
  // A page opened from one of the Chapter tab's rows.
  "page",
  // The points ledger's member, from a member's card.
  LEDGER_MEMBER_PARAM,
] as const;

/**
 * The pages the Chapter tab's rows open (`?tab=org&page=`): each holds what
 * was one long section of the tab, so the tab itself is the profile's fields
 * and a few rows (Paul, 2026-11-20, Discord's channel settings).
 */
export const CHAPTER_SETTINGS_PAGES = [
  "mark",
  "accent",
  "identity",
  "type",
  "vocabulary",
] as const;
export type ChapterSettingsPage = (typeof CHAPTER_SETTINGS_PAGES)[number];

export function isChapterSettingsPage(
  value: string | null | undefined,
): value is ChapterSettingsPage {
  return (CHAPTER_SETTINGS_PAGES as readonly string[]).includes(value ?? "");
}

/** The Chapter tab, or one of the pages its rows open. */
export function chapterSettingsHref(page: ChapterSettingsPage | null): string {
  return page ? `/settings?tab=org&page=${page}` : "/settings?tab=org";
}

/**
 * Where an old tool route sends its visitor: `target` (a Chapter settings
 * address) with the visit's own search params carried over, so a channel id,
 * Discord's `?discord=` outcome or a store build's `?from=app` survives the
 * hop. `tab` is the target's; one in the old link would not be.
 */
export function settingsRedirectPath(
  target: string,
  searchParams: Readonly<Record<string, string | string[] | undefined>>,
): string {
  const [path, query = ""] = target.split("?");
  const params = new URLSearchParams(query);
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "tab" || params.has(key)) continue;
    if (typeof value === "string") params.set(key, value);
  }
  return `${path}?${params.toString()}`;
}

/** A page drawn in place of a module page of Chapter settings. */
export type SettingsSubpage =
  | {
      kind: "channel";
      channelId: string;
      /** One of the channel's own pages, or null for its settings. */
      page: ChannelSettingsPage | null;
    }
  | { kind: "discord-import" }
  | { kind: "chat-page"; page: ChatSettingsPage };

/**
 * Which page, if any, `?channel=`, `?tool=` or `?page=` opens in place of
 * module page `moduleKey`. Only for a viewer who holds the tool behind it
 * (`holdsTool` takes a `SETTINGS_TOOLS` id): anyone else gets the module
 * page, as a link to a tool they lack never opened it either.
 */
export function settingsSubpageFor(
  moduleKey: string,
  params: {
    channel: string | null;
    tool: string | null;
    page?: string | null;
  },
  holdsTool: (toolId: string) => boolean,
): SettingsSubpage | null {
  if (moduleKey !== "chat") return null;
  if (params.channel && holdsTool("chat-admin")) {
    return {
      kind: "channel",
      channelId: params.channel,
      page: isChannelSettingsPage(params.page) ? params.page : null,
    };
  }
  if (params.tool === DISCORD_IMPORT_TOOL && holdsTool("discord-import")) {
    return { kind: "discord-import" };
  }
  // Each page gates itself as its section on the Chat page did: the
  // background for whoever edits the chapter profile, the queue for report
  // reviewers.
  if (isChatSettingsPage(params.page) && holdsTool("chat-admin")) {
    return { kind: "chat-page", page: params.page };
  }
  return null;
}
