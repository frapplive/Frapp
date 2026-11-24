import { isModuleEnabled } from "./module-enablement";
import {
  can,
  canAll,
  EVENT_CREATE_PERMISSIONS,
  TASK_CREATE_PERMISSIONS,
} from "./permissions";

/**
 * The names of the app's places and of what New starts, one list for web and
 * the phone (`principles.md` P6.1; Paul, 2026-11-24, #5943).
 *
 * The product answers three questions, each in one place
 * (`spec/product/positioning.md` § Three questions): what is being said
 * (channels, Messages), what is on me and what is happening (Activity,
 * Calendar), and where is it and who is it (Resources, Directory). Before
 * this file each app kept its own words, and they had drifted: web said
 * "Direct messages" and "Events" where the phone said "Messages" and
 * "Calendar". A place is named here once, and what draws its name on a screen
 * reads it from here: web's nav rows, and the phone's tab and screen titles,
 * back labels and You rows.
 *
 * Not yet read from here, and why: web's page metadata titles, which are
 * checked against the nav rows by `page-title.spec.ts` instead.
 */
export const SECTION_NAMES = {
  activity: "Activity",
  calendar: "Calendar",
  directory: "Directory",
  messages: "Messages",
  resources: "Resources",
  search: "Search",
} as const;

/**
 * What New starts, in the order a member who never rearranges them sees.
 * Two readers: the phone's + panel (`apps/mobile/lib/quick-actions.ts`),
 * where the order's reasons are recorded, and web's New page
 * (`apps/web/components/ask/new-actions.tsx`, #5946), which draws the ones
 * a browser can start (`WEB_NEW_ACTIONS`). Who may use each is
 * `availableNewActions`, one rule for both.
 */
export const NEW_ACTION_ORDER = [
  "newMinutes",
  "search",
  "newEvent",
  "newTask",
  "invite",
  "message",
  "hostCheckIn",
  "logHours",
  "study",
  "upload",
] as const;

export type NewActionKey = (typeof NEW_ACTION_ORDER)[number];

export const NEW_ACTION_LABELS: Record<NewActionKey, string> = {
  newMinutes: "New minutes",
  search: SECTION_NAMES.search,
  newEvent: "New event",
  newTask: "New task",
  invite: "Invite",
  message: "New message",
  hostCheckIn: "Host check-in",
  logHours: "Log hours",
  study: "Study",
  upload: "Upload",
};

/**
 * The actions web's New page draws, in the shared order. The rest belong to
 * the phone or to another row: Search is the sidebar's own row, Invite is in
 * the Directory, and Host check-in and Study need the phone in hand (its
 * camera, its location).
 */
const WEB_NEW_ACTION_KEYS: ReadonlySet<NewActionKey> = new Set([
  "newMinutes",
  "newEvent",
  "newTask",
  "message",
  "logHours",
  "upload",
]);
export const WEB_NEW_ACTIONS: readonly NewActionKey[] = NEW_ACTION_ORDER.filter(
  (key) => WEB_NEW_ACTION_KEYS.has(key),
);

export type NewActionAccess = {
  permissions: readonly string[] | null | undefined;
  /** The chapter's `enabled_modules`, once read. Unread counts as on. */
  enabledModules: Record<string, boolean> | null | undefined;
};

/**
 * The actions this member can use in this chapter, in the shared order:
 * their role grants it and the module is on. The same checks the API makes
 * on what each action does (each gate names its endpoint), so neither app
 * offers something the server would then refuse.
 */
export function availableNewActions({
  permissions,
  enabledModules,
}: NewActionAccess): NewActionKey[] {
  const on = (key: string) => isModuleEnabled(enabledModules, key);
  const allowed: Record<NewActionKey, boolean> = {
    // `POST /v1/meetings` checks `meetings:record` behind the module.
    newMinutes: on("meetings") && can("meetings:record", permissions),
    // Members, messages and events come from `GET /v1/search`, which checks
    // `members:view`, as the Directory behind Message does.
    search: can("members:view", permissions),
    // The event sheet's own gate: creating reads the roster, which the events
    // controller guards with members:view.
    newEvent: on("events") && canAll(EVENT_CREATE_PERMISSIONS, permissions),
    // The route's grant (`TASK_CREATE_PERMISSIONS`, the chat + picker's New
    // task reads it too): `tasks:manage` under the controller's `members:view`.
    newTask: on("tasks") && canAll(TASK_CREATE_PERMISSIONS, permissions),
    // Every invite route (`POST /v1/invites`, `GET /v1/invites`) checks
    // `members:invite`. Invites have no module switch.
    invite: can("members:invite", permissions),
    // The Directory lists the roster (`GET /v1/members`, `members:view`).
    message: can("members:view", permissions),
    hostCheckIn: on("events") && can("events:update", permissions),
    // Filing an entry is `service:log` (`POST /v1/service-entries`), which the
    // seeded New Member and Alumni roles don't hold.
    logHours: on("hours") && can("service:log", permissions),
    // A session starts against the chapter's study zones, so both modules.
    // The study endpoints sit behind `members:view` too.
    study: on("hours") && on("geofences") && can("members:view", permissions),
    upload: on("documents") && can("chapter_docs:upload", permissions),
  };
  return NEW_ACTION_ORDER.filter((key) => allowed[key]);
}
