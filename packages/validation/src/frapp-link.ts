import { PRODUCTION_APP_ORIGIN } from "./invite-token";
import {
  CHAT_LINK_CHANNEL_PARAM,
  CHAT_LINK_MESSAGE_PARAM,
  CHAT_LINK_PATH,
} from "./message-link";
import { appLinkParams } from "./native-app";
import {
  normalizeProofLink,
  proofLinkDomain,
  TASK_PROOF_LINK_MAX,
} from "./task-proof";

/**
 * A Frapp link (Paul 2026-11-22, `spec/behavior/frapp-links.md`): one thing
 * a task or an event points at, drawn one way on both apps. It is a web
 * address, or one of the chapter's own records: a Chapter Files document,
 * a meeting's minutes, an event, or a chat message.
 *
 * - A record link stores the record's id. Its name is read live, for the
 *   member looking (`POST /v1/frapp-links/resolve`), so a rename shows
 *   everywhere, a deleted record reads "Removed", and a member who can't open
 *   it never sees its name. A task's record link stores no title at all. An
 *   event's always carries one, as the event contract has since #4934: a
 *   document's name when it was attached (which phone builds from before
 *   Frapp links still draw), and the kind's own word for the rest.
 * - A web link stores its address and a title (its domain when none was
 *   typed). Frapp never fetches it.
 *
 * Events' attachments (#4934) were the first of these and are now this same
 * list (`EventAttachment` is `FrappLink`).
 */

/** Links on one task or one event (the tables' checks hold the same number). */
export const FRAPP_LINKS_MAX = 10;
/** A web link's title, as a member reads it in the list. */
export const FRAPP_LINK_TITLE_MAX = 120;
/** Links one resolve reads at once: a task's, plus room for an Ask card's. */
export const FRAPP_LINKS_RESOLVE_MAX = 40;

export const FRAPP_LINK_KINDS = [
  "link",
  "document",
  "minutes",
  "event",
  "message",
] as const;
export type FrappLinkKind = (typeof FRAPP_LINK_KINDS)[number];

/** The record kinds: every kind but a web link. */
export const FRAPP_RECORD_LINK_KINDS = [
  "document",
  "minutes",
  "event",
  "message",
] as const;
export type FrappRecordLinkKind = (typeof FRAPP_RECORD_LINK_KINDS)[number];

/** A titled web address. */
export interface FrappWebLink {
  id: string;
  kind: "link";
  url: string;
  title: string;
}

/**
 * A Chapter Files document. `title` is set only on an event's: the name it had
 * when attached, for older phone builds (the kind's word on other record
 * kinds). The live name always comes from resolve.
 */
export interface FrappDocumentLink {
  id: string;
  kind: "document";
  document_id: string;
  title?: string;
}

/** A meeting's minutes (`meetings.id`). `title`: see {@link FrappDocumentLink}. */
export interface FrappMinutesLink {
  id: string;
  kind: "minutes";
  meeting_id: string;
  title?: string;
}

/** An event on the calendar. `title`: see {@link FrappDocumentLink}. */
export interface FrappEventLink {
  id: string;
  kind: "event";
  event_id: string;
  title?: string;
}

/** A chat message, in its channel. `title`: see {@link FrappDocumentLink}. */
export interface FrappMessageLink {
  id: string;
  kind: "message";
  channel_id: string;
  message_id: string;
  title?: string;
}

/** One Frapp link. `id` is the client's, unique within its list. */
export type FrappLink =
  | FrappWebLink
  | FrappDocumentLink
  | FrappMinutesLink
  | FrappEventLink
  | FrappMessageLink;

export type FrappRecordLink = Exclude<FrappLink, FrappWebLink>;

/** What a record link names, without the list's own `id`. */
export type FrappLinkTarget =
  | Omit<FrappDocumentLink, "id" | "title">
  | Omit<FrappMinutesLink, "id" | "title">
  | Omit<FrappEventLink, "id" | "title">
  | Omit<FrappMessageLink, "id" | "title">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(entry: Record<string, unknown>, key: string): string | null {
  const value = entry[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * A web link's address as Frapp keeps it: trimmed, http or https only, or
 * `null` when it isn't one (`normalizeProofLink`).
 */
export function normalizeFrappLinkUrl(value: string): string | null {
  return normalizeProofLink(value);
}

/**
 * A web link's title as the API takes it: whitespace collapsed and cut to
 * `FRAPP_LINK_TITLE_MAX`.
 */
export function frappLinkTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().slice(0, FRAPP_LINK_TITLE_MAX);
}

/**
 * A web link's title when its adder left it empty: its domain
 * ("docs.google.com"), the way a pasted link reads in chat.
 */
export function frappWebLinkTitle(title: string, url: string): string {
  return frappLinkTitle(title) || frappLinkTitle(proofLinkDomain(url));
}

/**
 * Why a pasted address can't be attached, or `null` when it can: the form's
 * words for `normalizeFrappLinkUrl`'s two refusals.
 */
export function frappLinkUrlProblem(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Paste a web address.";
  if (trimmed.length > TASK_PROOF_LINK_MAX) {
    return `That link is too long to attach (over ${TASK_PROOF_LINK_MAX} characters).`;
  }
  return normalizeFrappLinkUrl(trimmed)
    ? null
    : "Paste a web address starting with http:// or https://.";
}

function withTitle<T extends FrappLink>(
  link: T,
  entry: Record<string, unknown>,
): T {
  const title = text(entry, "title");
  return title ? { ...link, title } : link;
}

/**
 * One stored entry as both apps and the API read it, or `null` when it isn't
 * one. The lists have no response schema, so an entry that isn't a link, or
 * a kind this build doesn't know, is skipped rather than drawn broken. A web
 * link's address is checked again here, not only on save: a row written some
 * other way must never put a `javascript:` or `data:` address under a tap.
 */
export function readFrappLink(entry: unknown): FrappLink | null {
  if (!isRecord(entry)) return null;
  const id = text(entry, "id");
  if (!id) return null;
  switch (entry.kind) {
    case "link": {
      const url = normalizeFrappLinkUrl(text(entry, "url") ?? "");
      if (!url) return null;
      const title = text(entry, "title") ?? proofLinkDomain(url);
      return { id, kind: "link", url, title };
    }
    case "document": {
      const documentId = text(entry, "document_id");
      return documentId
        ? withTitle({ id, kind: "document", document_id: documentId }, entry)
        : null;
    }
    case "minutes": {
      const meetingId = text(entry, "meeting_id");
      return meetingId
        ? withTitle({ id, kind: "minutes", meeting_id: meetingId }, entry)
        : null;
    }
    case "event": {
      const eventId = text(entry, "event_id");
      return eventId
        ? withTitle({ id, kind: "event", event_id: eventId }, entry)
        : null;
    }
    case "message": {
      const channelId = text(entry, "channel_id");
      const messageId = text(entry, "message_id");
      return channelId && messageId
        ? withTitle(
            {
              id,
              kind: "message",
              channel_id: channelId,
              message_id: messageId,
            },
            entry,
          )
        : null;
    }
    default:
      return null;
  }
}

/** A stored list, read as {@link readFrappLink} reads each entry. */
export function readFrappLinks(value: unknown): FrappLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const link = readFrappLink(entry);
    return link ? [link] : [];
  });
}

/**
 * What a link points at, as one string: the same record (or address) gives
 * the same key whatever its list id, so a list holds each once and a resolve
 * answer matches back to its rows. `document:<id>`, `minutes:<id>`,
 * `event:<id>`, `message:<id>`, `link:<url>`.
 */
export function frappLinkKey(
  link: FrappLinkTarget | Pick<FrappWebLink, "kind" | "url">,
): string {
  switch (link.kind) {
    case "link":
      return `link:${link.url}`;
    case "document":
      return `document:${link.document_id}`;
    case "minutes":
      return `minutes:${link.meeting_id}`;
    case "event":
      return `event:${link.event_id}`;
    case "message":
      return `message:${link.message_id}`;
  }
}

/** Whether `links` already holds what `next` points at. */
export function frappLinksHold(
  links: readonly FrappLink[],
  next: FrappLinkTarget | Pick<FrappWebLink, "kind" | "url">,
): boolean {
  const key = frappLinkKey(next);
  return links.some((link) => frappLinkKey(link) === key);
}

/** The record part of a link: what a resolve asks about. */
export function frappLinkTarget(link: FrappRecordLink): FrappLinkTarget {
  switch (link.kind) {
    case "document":
      return { kind: "document", document_id: link.document_id };
    case "minutes":
      return { kind: "minutes", meeting_id: link.meeting_id };
    case "event":
      return { kind: "event", event_id: link.event_id };
    case "message":
      return {
        kind: "message",
        channel_id: link.channel_id,
        message_id: link.message_id,
      };
  }
}

export function isFrappRecordLink(link: FrappLink): link is FrappRecordLink {
  return link.kind !== "link";
}

/** A link with a title on every kind, the shape an event's list is written in. */
export type FrappTitledLink = FrappLink & { title: string };

/**
 * The list as an event write sends it: every entry carries a title, since
 * the event contract has required one since #4934. A document keeps the
 * name it was attached with (`fallbackNames` supplies one for a document
 * attached just now); the other record kinds take their kind's word, never
 * a record's name, so no write copies a name a reader might not see.
 */
export function withEventLinkTitles(
  links: readonly FrappLink[],
  fallbackNames: ReadonlyMap<string, string> = new Map(),
): FrappTitledLink[] {
  return links.map((link): FrappTitledLink => {
    if (link.kind === "link") return link;
    if (link.kind === "document") {
      const title = frappLinkTitle(
        link.title ?? fallbackNames.get(link.document_id) ?? "",
      );
      return { ...link, title: title || FRAPP_LINK_COPY.kindNames.document };
    }
    return { ...link, title: FRAPP_LINK_COPY.kindNames[link.kind] };
  });
}

/** The list with `target` added at the end under a new id, unless it is full or holds it already. */
export function withFrappLink(
  links: readonly FrappLink[],
  target: FrappLinkTarget | Omit<FrappWebLink, "id"> | Omit<FrappLink, "id">,
  newId: () => string,
): FrappLink[] {
  if (
    links.length >= FRAPP_LINKS_MAX ||
    frappLinksHold(links, target as FrappLinkTarget)
  ) {
    return [...links];
  }
  return [...links, { ...target, id: newId() } as FrappLink];
}

// ---------------------------------------------------------------------------
// Where a link opens, and a pasted Frapp address read back into one
// ---------------------------------------------------------------------------

/** `/documents?document=<id>` opens that file in the web viewer. */
export const DOCUMENT_LINK_PATH = "/documents";
export const DOCUMENT_LINK_PARAM = "document";
/** `/events?event=<id>` opens that event's sheet on the web. */
export const EVENT_LINK_PATH = "/events";
export const EVENT_LINK_PARAM = "event";
/** `/meetings/<id>` is that meeting's minutes on the web. */
export const MINUTES_LINK_PATH_PREFIX = "/meetings/";

/**
 * Where a link opens on the web dashboard: the address itself for a web
 * link, and the dashboard's own relative path for a record.
 */
export function frappLinkWebHref(link: FrappLink): string {
  switch (link.kind) {
    case "link":
      return link.url;
    case "document":
      return `${DOCUMENT_LINK_PATH}?${DOCUMENT_LINK_PARAM}=${encodeURIComponent(link.document_id)}`;
    case "minutes":
      return `${MINUTES_LINK_PATH_PREFIX}${encodeURIComponent(link.meeting_id)}`;
    case "event":
      return `${EVENT_LINK_PATH}?${EVENT_LINK_PARAM}=${encodeURIComponent(link.event_id)}`;
    case "message":
      return (
        `${CHAT_LINK_PATH}?${CHAT_LINK_CHANNEL_PARAM}=${encodeURIComponent(link.channel_id)}` +
        `&${CHAT_LINK_MESSAGE_PARAM}=${encodeURIComponent(link.message_id)}`
      );
  }
}

function sameOrigin(url: URL, origins: readonly string[]): boolean {
  return origins.some((origin) => {
    try {
      return new URL(origin).origin === url.origin;
    } catch {
      return false;
    }
  });
}

/**
 * The record a pasted Frapp address names, or `null` for any other address
 * (Paul 2026-11-22: "a pasted app.frapp.live link resolves to the record").
 * Reads the dashboard's own shapes on `origins` (production's, plus the
 * caller's own): `/documents?document=`, `/meetings/<id>`,
 * `/events?event=` and `/chat?channel=&message=`. A channel link with no
 * message stays a web link.
 */
export function parseFrappAppLink(
  href: string,
  origins: readonly string[] = [PRODUCTION_APP_ORIGIN],
): FrappLinkTarget | null {
  const all = [...new Set([PRODUCTION_APP_ORIGIN, ...origins])];
  const param = (path: string, name: string): string | null =>
    appLinkParams(href, all, path)?.get(name)?.trim() || null;

  const documentId = param(DOCUMENT_LINK_PATH, DOCUMENT_LINK_PARAM);
  if (documentId) return { kind: "document", document_id: documentId };

  const eventId = param(EVENT_LINK_PATH, EVENT_LINK_PARAM);
  if (eventId) return { kind: "event", event_id: eventId };

  const channelId = param(CHAT_LINK_PATH, CHAT_LINK_CHANNEL_PARAM);
  const messageId = param(CHAT_LINK_PATH, CHAT_LINK_MESSAGE_PARAM);
  if (channelId && messageId) {
    return { kind: "message", channel_id: channelId, message_id: messageId };
  }

  let url: URL;
  try {
    url = new URL(href.trim());
  } catch {
    return null;
  }
  if (!sameOrigin(url, all)) return null;
  const minutes = /^\/meetings\/([^/]+)\/?$/.exec(url.pathname);
  if (minutes?.[1]) {
    const meetingId = decodeURIComponent(minutes[1]).trim();
    if (meetingId) return { kind: "minutes", meeting_id: meetingId };
  }
  return null;
}

// ---------------------------------------------------------------------------
// What a resolve answers, and how a row reads
// ---------------------------------------------------------------------------

/**
 * Where a record stands for the member looking: `ok` (named), `removed`
 * (deleted, or never this chapter's), or `hidden` (there, but not theirs to
 * open; its name is never sent).
 */
export const FRAPP_LINK_STATES = ["ok", "removed", "hidden"] as const;
export type FrappLinkState = (typeof FRAPP_LINK_STATES)[number];

/**
 * One record as `POST /v1/frapp-links/resolve` answers it, for the member
 * asking. `title` and the facts below it are null unless `state` is `ok`.
 */
export interface FrappLinkResolved {
  /** {@link frappLinkKey} of the target asked about. */
  key: string;
  state: FrappLinkState;
  /** The document's, event's or meeting's name; the channel's for a message. */
  title: string | null;
  /** The meeting's or event's start, or when the message was sent (ISO). */
  date: string | null;
  /** Who sent the message. Null on every other kind. */
  author: string | null;
}

/** The words both apps show on a link row. */
export const FRAPP_LINK_COPY = {
  field: "Attached",
  attach: "Attach",
  removed: "Removed",
  hidden: "You don't have access",
  chapterFiles: "Chapter Files",
  full: `Holds ${FRAPP_LINKS_MAX} attachments.`,
  remove: (name: string) => `Remove "${name}"`,
  /** The picker's one field: it searches files, minutes and events, and takes a pasted address. */
  pickerPlaceholder: "Search or paste a link",
  noMatches: "Nothing here matches.",
  /** The kind's own word, for a record whose name can't be read. */
  kindNames: {
    document: "Document",
    minutes: "Minutes",
    event: "Event",
    message: "Message",
  } satisfies Record<FrappRecordLinkKind, string>,
} as const;

/** "Nov 16" (or "Nov 16, 2025" in another year) for a row, in the reader's zone. */
function shortDate(iso: string, now: Date): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const sameYear = at.getFullYear() === now.getFullYear();
  return at.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** How one link row reads: its name, the quiet line beside it, and whether it opens. */
export interface FrappLinkRow {
  name: string;
  detail: string | null;
  /** False for a removed or hidden record: the row is drawn, never opened. */
  opens: boolean;
  /** True while the record's name is still being read. */
  pending: boolean;
}

/**
 * One row's words, the same on both apps: a web link's title and domain;
 * a record's live name and what it is ("Chapter Files", the meeting's or
 * event's date, "#channel · who"). Before the resolve answers, a record shows
 * the name an event's document kept, else its kind's word, as pending.
 */
export function frappLinkRow(
  link: FrappLink,
  resolved: FrappLinkResolved | undefined,
  now: Date = new Date(),
): FrappLinkRow {
  if (link.kind === "link") {
    return {
      name: link.title,
      detail: proofLinkDomain(link.url),
      opens: true,
      pending: false,
    };
  }
  const kindName = FRAPP_LINK_COPY.kindNames[link.kind];
  if (!resolved) {
    return {
      name: (link.kind === "document" ? link.title : undefined) ?? kindName,
      detail: null,
      opens: true,
      pending: true,
    };
  }
  if (resolved.state === "removed") {
    return {
      name: FRAPP_LINK_COPY.removed,
      detail: kindName,
      opens: false,
      pending: false,
    };
  }
  if (resolved.state === "hidden") {
    return {
      name: FRAPP_LINK_COPY.hidden,
      detail: kindName,
      opens: false,
      pending: false,
    };
  }
  const name = resolved.title ?? kindName;
  const date = resolved.date ? shortDate(resolved.date, now) : "";
  switch (link.kind) {
    case "document":
      return {
        name,
        detail: FRAPP_LINK_COPY.chapterFiles,
        opens: true,
        pending: false,
      };
    case "minutes":
      return {
        name,
        detail: date ? `Minutes · ${date}` : "Minutes",
        opens: true,
        pending: false,
      };
    case "event":
      return { name, detail: date || null, opens: true, pending: false };
    case "message":
      return {
        name: `#${name}`,
        detail:
          [resolved.author, date].filter((part) => part).join(" · ") || null,
        opens: true,
        pending: false,
      };
  }
}
