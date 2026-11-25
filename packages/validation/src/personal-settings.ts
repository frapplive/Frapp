import { isNotificationCategoryKey } from "./notification-categories";

/**
 * The member's own Settings (web `/preferences`, the phone's Settings screen),
 * so the two apps draw the same pages, in the same order, under the same
 * words (#6032, epic #5964). Web's rail lists these pages; the phone's first
 * screen lists them as rows, each pushing its page.
 *
 * Two groups, by where a setting is stored. "My account" follows the member
 * into every chapter, apart from the alert switches on Notifications, which
 * sit there because that is where a member looks for them (Slack keeps the
 * level and the schedule on one Notifications page) and carry their own
 * chapter heading. "In <chapter>" changes with the chapter switcher.
 *
 * A page's `value` is its address: web's `?section=` and the phone's
 * `?page=`. Web keeps retired addresses working through its alias list
 * (`personal-settings-sections.ts`), because the API's sign-in returns name
 * some of them.
 */
export const PERSONAL_SETTINGS_PAGES = [
  { value: "notifications", label: "Notifications", group: "account" },
  { value: "chat", label: "Chat", group: "account" },
  { value: "apps", label: "Linked apps", group: "account" },
  // Only where the server has AI: each app passes whether it does.
  { value: "ai", label: "Frapp Intelligence", group: "account" },
  { value: "account", label: "Account", group: "account" },
  { value: "blocked", label: "Blocked members", group: "chapter" },
  // Web only, and off while Dues is off for the beta: the phone pays dues
  // from its Dues screen.
  { value: "invoices", label: "My invoices", group: "chapter" },
] as const;

export type PersonalSettingsPage =
  (typeof PERSONAL_SETTINGS_PAGES)[number]["value"];

/**
 * The pages the phone's Settings screen pushes (`/preferences?page=…`).
 * Blocked members opens a sheet from the first page, and My invoices is web
 * only, so neither is one.
 */
export type PhoneSettingsPage = Exclude<
  PersonalSettingsPage,
  "blocked" | "invoices"
>;

export type PersonalSettingsGroup =
  (typeof PERSONAL_SETTINGS_PAGES)[number]["group"];

/** The label a page goes by, in the rail, on its row and as its title. */
export function personalSettingsPageLabel(page: PersonalSettingsPage): string {
  return PERSONAL_SETTINGS_PAGES.find((p) => p.value === page)!.label;
}

/**
 * A group's name. The chapter group is named for the chapter it changes with,
 * and in general terms before the chapter is known.
 */
export function personalSettingsGroupLabel(
  group: PersonalSettingsGroup,
  chapterName?: string | null,
): string {
  if (group === "account") return "My account";
  const name = chapterName?.trim();
  return name ? `In ${name}` : "In your chapter";
}

/** The headings and footnotes inside the pages, the same on both apps. */
export const PERSONAL_SETTINGS_COPY = {
  quietHours: "Quiet hours",
  quietHoursFootnote:
    "Non-urgent notifications stay silent between these times.",
  activity: "Activity",
  density: "Density",
  directMessages: "Direct messages",
  signIn: "Sign in",
  session: "Session",
  /** The phone's group of the app's own pages and the legal links. */
  about: "About",
} as const;

/**
 * The footnote under Notifications' chapter group: where it applies, where
 * chat is muted instead, and, while the catalog has no Announcements switch,
 * that they can't be switched off here. Scoped to these switches, never a
 * delivery promise: a member's channel level for #announcements, or a block,
 * still stops an announcement push (`spec/behavior/chat/README.md`), so
 * "always arrive" would claim too much. Their pushes go out URGENT, which
 * passes the preference gate (#1041), so a switch would suppress nothing.
 */
export function chapterAlertsFootnote(): string {
  const base =
    "Applies on every device. Mute a channel or DM from the chat itself";
  return isNotificationCategoryKey("announcements")
    ? `${base}.`
    : `${base}; announcements can't be switched off here.`;
}
