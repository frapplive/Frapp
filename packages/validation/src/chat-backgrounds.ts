/**
 * Chat backgrounds (#3973): the keys a chapter default or a channel override
 * may hold. The database CHECK constraints in
 * `supabase/migrations/20261110235500_chat_backgrounds.sql` mirror this list.
 * How each one looks lives in `@repo/theme` (`chat-backgrounds.ts`); this is
 * only the contract the API validates against.
 */
import { isDirectChannel } from "./chat-notification-defaults";

export const CHAT_BACKGROUND_BUILT_INS = [
  "plain",
  "gold-glow",
  "midnight",
  "game-day",
  "letters",
  "holiday",
] as const;
export type ChatBackgroundBuiltIn = (typeof CHAT_BACKGROUND_BUILT_INS)[number];

/** An uploaded chapter photo, stored beside the key as a `branding` path. */
export const CHAT_BACKGROUND_PHOTO = "photo" as const;

export const CHAT_BACKGROUND_KEYS = [
  ...CHAT_BACKGROUND_BUILT_INS,
  CHAT_BACKGROUND_PHOTO,
] as const;
export type ChatBackgroundKey = (typeof CHAT_BACKGROUND_KEYS)[number];

export const CHAT_BACKGROUND_LABELS: Record<ChatBackgroundKey, string> = {
  plain: "Plain",
  "gold-glow": "Gold glow",
  midnight: "Midnight",
  "game-day": "Game day",
  letters: "Letters",
  holiday: "Holiday",
  photo: "Photo",
};

/**
 * The line under every background picker, on web and mobile: why a photo is
 * safe to read over, and how it is answerable.
 */
export const CHAT_BACKGROUND_PHOTO_NOTE =
  "Photos are dimmed and blurred so messages stay readable. Setting one posts a line in chat that anyone can report.";

/** The inherit swatch's label: "(photo)" when the default is a photo it previews as plain. */
export function chatBackgroundDefaultLabel(
  chapterDefault: string | null | undefined,
): string {
  return chapterDefault === CHAT_BACKGROUND_PHOTO
    ? "Chapter default (photo)"
    : "Chapter default";
}

/**
 * Whether a channel can have its own background at all: never a DM or group
 * DM (always plain), the audit log (system-write only, #3909) or an archived
 * channel. The API refuses a set on any of them, and announces a photo
 * default only in a channel that passes; the clients offer the picker only
 * where it passes (`canSetChannelBackground` in `@repo/hooks`).
 */
export function channelTakesBackground(channel: {
  type?: string | null;
  is_audit_log?: boolean | null;
  archived_at?: string | null;
}): boolean {
  if (isDirectChannel({ type: channel.type ?? "" })) return false;
  return !channel.is_audit_log && !channel.archived_at;
}

export function isChatBackgroundKey(
  value: unknown,
): value is ChatBackgroundKey {
  return (
    typeof value === "string" &&
    (CHAT_BACKGROUND_KEYS as readonly string[]).includes(value)
  );
}

/**
 * The Holiday season (#6149): from December 1 to December 26, in the viewer's
 * own local date, a chapter whose default is Plain shows Holiday instead,
 * unless an officer turned the season off for the chapter
 * (`holiday_season: false`). A channel or a chapter that chose its own
 * background keeps it, and a DM stays plain. Computed from the date, so the
 * season starts and ends with no deploy and no write.
 */
export const HOLIDAY_SEASON = {
  /** 0-based, as `Date#getMonth` counts. */
  month: 11,
  firstDay: 1,
  lastDay: 26,
} as const;

/** Whether `date`, read in its own local time zone, falls in the season. */
export function isHolidaySeason(date: Date): boolean {
  return (
    date.getMonth() === HOLIDAY_SEASON.month &&
    date.getDate() >= HOLIDAY_SEASON.firstDay &&
    date.getDate() <= HOLIDAY_SEASON.lastDay
  );
}

/**
 * Whether the season's flair shows (#6149, Winston 2026-11-27): a Santa hat
 * on the crest and on authors' photos, and holly after their names, all over
 * the app from Dec 1 to 26 while the chapter's season switch is on, whatever
 * its background. Off until the chapter's setting has loaded, so it never
 * flashes on for a chapter that turned it off.
 */
export function holidayFlairOn(
  chapterDefault: { holiday_season?: boolean } | null | undefined,
  now: Date,
): boolean {
  return (
    !!chapterDefault &&
    chapterDefault.holiday_season !== false &&
    isHolidaySeason(now)
  );
}

/** The officer switch's words, on web and the phone. */
export const HOLIDAY_SEASON_COPY = {
  label: "Holiday background this season",
  description:
    "Dec 1 to 26, channels that follow a Plain chapter default show Holiday.",
  /** In place of the description when a flip didn't save (it flips back). */
  saveFailed: "Couldn't save. Try again.",
} as const;

/**
 * What the chapter default looks like right now, season applied:
 * the key the channel pickers' "Chapter default" swatch previews, so it
 * matches what a channel that follows the default draws.
 */
export function seasonalChapterDefault<K extends string>(
  chapterDefault:
    { background: K; holiday_season?: boolean } | null | undefined,
  now: Date,
): K | "holiday" | undefined {
  if (!chapterDefault) return undefined;
  return withHolidaySeason<{
    background: K | "holiday";
    source: "chapter";
    holiday_season?: boolean;
  }>({ ...chapterDefault, source: "chapter" }, now).background;
}

/**
 * What a member sees, season applied: the API's resolved background with
 * Plain swapped for Holiday while the season is on for this chapter. Only a
 * background that comes from the chapter default (`source: "chapter"`) is
 * swapped; a channel's own Plain was chosen, and a DM (`none`) stays plain.
 */
export function withHolidaySeason<
  T extends {
    background: string;
    source?: "channel" | "chapter" | "none";
    holiday_season?: boolean;
  },
>(resolved: T, now: Date): T {
  if (
    resolved.source === "chapter" &&
    resolved.background === "plain" &&
    resolved.holiday_season !== false &&
    isHolidaySeason(now)
  ) {
    return { ...resolved, background: "holiday" };
  }
  return resolved;
}
