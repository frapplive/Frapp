import { DOCUMENTS_TYPE_PARAM } from "./document-links";
import { DOCUMENT_LINK_PARAM } from "./frapp-link";
import {
  CHAT_LINK_CHANNEL_PARAM,
  CHAT_LINK_MESSAGE_PARAM,
} from "./message-link";

/**
 * Every web shell screen's address, and the phone screen it opens (#6034).
 *
 * The approved scheme (Paul, 2026-11-25; `spec/ui/web-dashboard/README.md`
 * § Addresses owns it): the **path** is the page whose sidebar row is lit,
 * and the **query** is anything that draws its own back arrow or X in place
 * of that page (a folder, a record, an editor, a Settings page, a named
 * view). Typing, filter chips, menus and dialogs are never in the address.
 *
 * The parameter names live here, not in `apps/web`: the web's own names
 * (`EVENT_PARAM`, `TASKS_TASK_PARAM` and the rest) are read from here, and
 * the phone maps a web link to its own screen from the same rows once #6050
 * lands, so a rename can't split the two apps.
 * The chat names stay `CHAT_LINK_*` (`./message-link`), which the phone
 * already mints in copied message links.
 */

/** The query parameters each page owns, by page. */
export const WEB_ADDRESS_PARAMS = {
  chat: {
    channel: CHAT_LINK_CHANNEL_PARAM,
    thread: "thread",
    message: CHAT_LINK_MESSAGE_PARAM,
  },
  messages: {
    channel: CHAT_LINK_CHANNEL_PARAM,
    thread: "thread",
    message: CHAT_LINK_MESSAGE_PARAM,
  },
  documents: {
    folder: "folder",
    document: DOCUMENT_LINK_PARAM,
    access: "access",
    type: DOCUMENTS_TYPE_PARAM,
  },
  events: {
    day: "day",
    event: "event",
    edit: "edit",
    hours: "hours",
    excuse: "excuse",
  },
  // Tasks folded into Activity with #5948 (`/tasks` only redirects here).
  activity: {
    view: "view",
    task: "task",
    group: "group",
    posting: "posting",
    item: "item",
    review: "review",
    extension: "extension",
  },
  members: { tab: "tab", member: "member", sort: "sort" },
  rush: { view: "view", prospect: "prospect" },
  profile: { open: "open" },
  preferences: { section: "section" },
  settings: {
    tab: "tab",
    page: "page",
    channel: "channel",
    tool: "tool",
    tier: "tier",
    role: "role",
    class: "class",
    zone: "zone",
    member: "member",
  },
} as const;

/**
 * `/documents?folder=+` (a space): No folder. Folder names are trimmed when
 * saved (`normalizeFolderName` in the API), so no folder is named a space.
 */
export const DOCUMENTS_NO_FOLDER_PARAM_VALUE = " ";

/**
 * Marks a page acts on once and then takes off the address with a replace,
 * so a reload or Back doesn't act again (§ Addresses, "One-shot marks").
 * `message` is chat's search or bookmark jump, dropped once it lands.
 */
export const ONE_SHOT_ADDRESS_PARAMS = {
  new: "new",
  message: CHAT_LINK_MESSAGE_PARAM,
  excuse: "excuse",
  setting: "setting",
} as const;

/** A phone route a web address opens: its pathname and parameter names. */
export interface PhoneAddress {
  /** An expo-router pathname under `apps/mobile/app/(app)`. */
  pathname: string;
  /** Web parameter name → the phone screen's parameter name. */
  params?: Readonly<Record<string, string>>;
}

/** One web address shape: a path, and the parameters that pick a phone screen. */
export interface WebAddressRow {
  /** The page's path, as the dashboard routes it (`/meetings/[id]` style). */
  path: string;
  /** The query parameters this page owns (from `WEB_ADDRESS_PARAMS`). */
  params: readonly string[];
  /**
   * The phone screens this page's addresses open, most specific first: the
   * first whose `when` parameters are all present wins. `null` is a web-only
   * page (Backwork, Chapter settings, Plan and billing), which the phone
   * doesn't claim, so its link stays in the browser.
   */
  phone: readonly (PhoneAddress & { when?: readonly string[] })[] | null;
}

const P = WEB_ADDRESS_PARAMS;

/**
 * Every dashboard route that draws, and the address it owns. A route kept
 * only to send old links on (`/tasks` to Activity, `/billing` to Chapter
 * settings) has no row: it never draws. `apps/web`'s route walk
 * (`every-page-has-an-address.spec.ts`) fails for a page missing here.
 */
export const WEB_ADDRESSES: readonly WebAddressRow[] = [
  {
    path: "/chat",
    params: Object.values(P.chat),
    phone: [
      {
        when: [P.chat.channel, P.chat.thread],
        pathname: "/chat-thread",
        params: {
          [P.chat.channel]: "channelId",
          [P.chat.thread]: "threadRootId",
          [P.chat.message]: "focusMessageId",
        },
      },
      {
        when: [P.chat.channel, P.chat.message],
        pathname: "/chat-thread",
        params: {
          [P.chat.channel]: "channelId",
          [P.chat.message]: "focusMessageId",
        },
      },
      {
        when: [P.chat.channel],
        pathname: "/chat-thread",
        params: { [P.chat.channel]: "channelId" },
      },
      { pathname: "/" },
    ],
  },
  {
    path: "/messages",
    params: Object.values(P.messages),
    phone: [
      {
        when: [P.messages.channel],
        pathname: "/chat-thread",
        params: {
          [P.messages.channel]: "channelId",
          [P.messages.thread]: "threadRootId",
          [P.messages.message]: "focusMessageId",
        },
      },
      { pathname: "/messages" },
    ],
  },
  {
    path: "/documents",
    params: Object.values(P.documents),
    phone: [{ pathname: "/documents" }],
  },
  {
    path: "/events",
    params: Object.values(P.events),
    phone: [
      {
        when: [P.events.event],
        pathname: "/event-details",
        params: { [P.events.event]: "id", [P.events.excuse]: "excuse" },
      },
      {
        when: [P.events.day],
        pathname: "/calendar-day",
        params: { [P.events.day]: "day" },
      },
      { pathname: "/events" },
    ],
  },
  {
    path: "/activity",
    params: Object.values(P.activity),
    phone: [
      {
        when: [P.activity.task],
        pathname: "/tasks",
        params: { [P.activity.task]: "task" },
      },
      {
        when: [P.activity.review],
        pathname: "/activity",
        params: { [P.activity.review]: "review" },
      },
      { pathname: "/activity" },
    ],
  },
  {
    path: "/members",
    params: Object.values(P.members),
    phone: [
      {
        when: [P.members.member],
        pathname: "/member",
        params: { [P.members.member]: "userId" },
      },
      { pathname: "/directory", params: { [P.members.sort]: "sort" } },
    ],
  },
  {
    path: "/rush",
    params: Object.values(P.rush),
    phone: [
      {
        when: [P.rush.prospect],
        pathname: "/rush-prospect",
        params: { [P.rush.prospect]: "candidateId" },
      },
      { pathname: "/rush" },
    ],
  },
  {
    path: "/profile",
    params: Object.values(P.profile),
    phone: [{ pathname: "/you" }],
  },
  {
    path: "/preferences",
    params: Object.values(P.preferences),
    phone: [{ pathname: "/preferences" }],
  },
  { path: "/settings", params: Object.values(P.settings), phone: null },
  // Pages with no address of their own below the path yet. Frapp
  // Intelligence (`/ask`) gets one when its conversations get ids (#4704).
  { path: "/ask", params: [], phone: [{ pathname: "/ask" }] },
  { path: "/whats-new", params: [], phone: [{ pathname: "/whats-new" }] },
  { path: "/meetings/[id]", params: [], phone: null },
  { path: "/meetings/[id]/notes", params: [], phone: null },
  { path: "/meetings/[id]/transcript", params: [], phone: null },
  { path: "/backwork", params: [], phone: null },
  { path: "/backwork/upload", params: [], phone: null },
  { path: "/affiliations", params: [], phone: null },
  { path: "/chapters", params: [], phone: null },
];

function pathMatches(pattern: string, pathname: string): boolean {
  const want = pattern.split("/");
  const got = pathname.replace(/\/+$/, "").split("/");
  if (want.length !== got.length) return false;
  return want.every(
    (segment, i) =>
      (segment.startsWith("[") && got[i] !== "") || segment === got[i],
  );
}

/** The row for a dashboard pathname, or `null` for a path no page owns. */
export function webAddressRow(pathname: string): WebAddressRow | null {
  return WEB_ADDRESSES.find((row) => pathMatches(row.path, pathname)) ?? null;
}

/**
 * The phone screen a web address opens, or `null` for a web-only page or an
 * address no page owns. `pathname` and `search` are a URL's own
 * (`/events`, `?event=…`).
 */
export function phoneAddressFor(
  pathname: string,
  search: string | URLSearchParams,
): { pathname: string; params: Record<string, string> } | null {
  const row = webAddressRow(pathname);
  if (!row?.phone) return null;
  const query =
    typeof search === "string" ? new URLSearchParams(search) : search;
  const target = row.phone.find((candidate) =>
    (candidate.when ?? []).every((name) => query.get(name)),
  );
  if (!target) return null;
  const params: Record<string, string> = {};
  for (const [web, phone] of Object.entries(target.params ?? {})) {
    const value = query.get(web);
    if (value) params[phone] = value;
  }
  return { pathname: target.pathname, params };
}
