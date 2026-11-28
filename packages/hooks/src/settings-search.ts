import {
  CHAPTER_LOGS_PERMISSIONS,
  canAll,
  isBetaOffModule,
  type PhoneSettingsPage,
} from "@repo/validation";
import { MODULE_SETTINGS } from "./module-settings";

/**
 * Settings search: one list of every setting a member can change, with the
 * words people use for it, read by the search field on both settings pages
 * (web's Chapter settings and Settings, the phone's Chapter settings and
 * Settings) and by web's Find dialog and the phone's Search screen, which list
 * the matches as their Settings group (`find-results.ts`).
 *
 * **Why an index, not the rail.** Typing "donate" has to find the Donation link
 * field inside the Chapter page, and "rush" the Recruitment page, so the
 * search reads fields and their synonyms, not section names (Paul, 2026-11-19,
 * "like Vercel"). Vercel's, GitHub's and Slack's settings searches work the
 * same way: a hand-kept list of settings with keywords, matched on the
 * client, each opening its page scrolled to the field.
 *
 * **Only what the viewer can change.** Each entry names the permissions it
 * takes to change it (`requires`); one the viewer can't change is never
 * listed, so a member searching "roles" isn't sent to a page that only says
 * who can change it. `"president"` is the wildcard holder, who alone changes
 * the chapter's AI switches and hands on the presidency.
 *
 * **Where an entry opens is per platform.** `web` names the Chapter settings
 * row (`?tab=`) or the Settings section (`?section=`) and the element to
 * scroll to and light (`anchor`, a DOM id the page already carries). `phone`
 * names the phone screen and the row's anchor (`SettingAnchor` in
 * `apps/mobile/components/settings/setting-anchor.tsx`). An entry the phone
 * has no screen for is still listed there and opens the web dashboard, so
 * an officer who searches "dues" on the phone learns where it lives.
 *
 * Keep an entry's `label` in the words its page uses, so the result reads like
 * the field it lands on.
 */

export type SettingsArea = "chapter" | "personal";

export type SettingPhoneScreen =
  | "/chapter-settings"
  | "/chapter-mark"
  | "/chapter-identity"
  | "/chapter-type"
  | "/chapter-vocabulary"
  | "/chapter-roles"
  | "/chapter-logs"
  | "/pledge-classes"
  | "/member-fields"
  | "/module-settings"
  | "/preferences";

export type SettingEntry = {
  /** Stable; it is the `?setting=` value a link carries. */
  id: string;
  label: string;
  area: SettingsArea;
  /** The rail row (web) it sits under, as the rail names it. */
  section: string;
  /** Other words for it: synonyms, what it does, what people call it. */
  keywords: readonly string[];
  /** Every one is needed to change it; `"president"` is the wildcard holder. */
  requires?: readonly string[] | "president";
  /** Listed only while this module is on (and not off for the beta). */
  module?: string;
  /** Listed only while this module isn't off for every chapter in the beta. */
  betaModule?: string;
  /** Listed only where the server has AI. */
  needsAi?: boolean;
  web?: {
    /** Chapter settings `?tab=`, or Settings `?section=`. */
    page: string;
    /** The DOM id to scroll to and light; without one, the tab opens at its top. */
    anchor?: string;
    /** More params the row needs, such as `tool=discord-import`. */
    params?: Readonly<Record<string, string>>;
  };
  /**
   * `page` is a page pushed inside the screen (the phone Settings screen's
   * `?page=`, the same address as web's `?section=`); without one the row is
   * on the screen's first page.
   */
  phone?: {
    screen: SettingPhoneScreen;
    page?: PhoneSettingsPage;
    anchor?: string;
    /** More params the screen needs, such as a module's `module=points`. */
    params?: Readonly<Record<string, string>>;
    /**
     * Drawn only for a chapter: the phone's Chapter tab parts that read the
     * chapter's config, which a council's routes refuse (#5933). A council
     * is sent to the web dashboard for it instead (`settingPhoneTarget`).
     */
    chapterOnly?: true;
  };
};

const CONFIG = ["chapter-config:view", "chapter-config:manage"] as const;

/** The search's words, the same on web and the phone. */
export const SETTINGS_SEARCH_COPY = {
  placeholder: "Search settings",
  none: "No settings match. Try another word.",
  /** Under a phone match that only the web dashboard changes. */
  onWeb: "Changed on the web dashboard.",
  browserFailed: "The web dashboard couldn't be opened. Try again in a moment.",
} as const;

/** Area names, as each page's title says them. */
export const SETTINGS_AREA_LABELS: Readonly<Record<SettingsArea, string>> = {
  chapter: "Chapter settings",
  personal: "Settings",
};

/**
 * Other words for each module page. Its key, name and rail order are
 * `MODULE_SETTINGS`'s (`module-settings.ts`), so search can't drift from the
 * page.
 */
const MODULE_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  chat: ["messages", "messaging"],
  announcements: ["announce", "broadcast", "news", "officer posts"],
  events: ["calendar", "rsvp", "attendance", "check in", "check-in"],
  points: ["leaderboard", "ledger"],
  hours: ["service", "study hours", "volunteer", "community service"],
  geofences: ["geofence", "study", "library", "map"],
  tasks: ["todo", "to do", "assignments", "chores"],
  polls: ["vote", "voting", "survey"],
  meetings: ["minutes", "agenda", "notes", "chapter meeting"],
  documents: ["files", "bylaws", "drive", "docs", "forms"],
  backwork: ["coursework", "tests", "exams", "old tests", "test bank"],
  reports: ["export", "csv", "spreadsheet"],
  rush: ["rush", "prospects", "pnm", "bids", "intake"],
  dues: ["payments", "fees", "money", "late fee", "payment plan"],
};

/** The module pages of Chapter settings, in rail order. */
const MODULE_WORDS = MODULE_SETTINGS.map((module) => ({
  key: module.key,
  label: module.label,
  alwaysOn: module.alwaysOn,
  keywords: MODULE_KEYWORDS[module.key] ?? [],
}));

const MODULE_SWITCH_WORDS = [
  "module",
  "turn on",
  "turn off",
  "enable",
  "disable",
  "who can",
  "permissions",
] as const;

const CHAPTER_ENTRIES: readonly SettingEntry[] = [
  // ---- Chapter --------------------------------------------------------
  {
    id: "chapter-name",
    label: "Chapter name",
    area: "chapter",
    section: "Chapter",
    keywords: ["name", "rename", "organization name", "fraternity", "sorority"],
    requires: CONFIG,
    web: { page: "org", anchor: "chapter-name" },
    phone: {
      screen: "/chapter-settings",
      anchor: "chapter-name",
      chapterOnly: true,
    },
  },
  {
    id: "university",
    label: "University",
    area: "chapter",
    section: "Chapter",
    keywords: ["school", "college", "campus"],
    requires: CONFIG,
    web: { page: "org", anchor: "chapter-university" },
    phone: {
      screen: "/chapter-settings",
      anchor: "university",
      chapterOnly: true,
    },
  },
  {
    id: "donation-link",
    label: "Donation link",
    area: "chapter",
    section: "Chapter",
    keywords: [
      "donate",
      "donations",
      "give",
      "giving",
      "fundraising",
      "philanthropy",
      "support the chapter",
    ],
    requires: CONFIG,
    web: { page: "org", anchor: "chapter-donation" },
    phone: {
      screen: "/chapter-settings",
      anchor: "donation-link",
      chapterOnly: true,
    },
  },
  {
    id: "logo",
    label: "Logo",
    area: "chapter",
    section: "Chapter",
    keywords: ["crest", "image", "picture", "icon", "emblem", "chapter mark"],
    requires: CONFIG,
    web: {
      page: "org",
      anchor: "settings-chapter-mark",
      params: { page: "mark" },
    },
    phone: {
      screen: "/chapter-mark",
      anchor: "logo",
      chapterOnly: true,
    },
  },
  {
    id: "short-name",
    label: "Short name",
    area: "chapter",
    section: "Chapter",
    keywords: ["nickname", "abbreviation", "chapter mark"],
    requires: CONFIG,
    web: {
      page: "org",
      anchor: "chapter-short-name",
      params: { page: "mark" },
    },
    phone: {
      screen: "/chapter-mark",
      anchor: "short-name",
      chapterOnly: true,
    },
  },
  {
    id: "accent",
    label: "Accent color",
    area: "chapter",
    section: "Chapter",
    keywords: ["color", "colour", "theme", "brand", "branding", "tint"],
    requires: CONFIG,
    web: { page: "org", anchor: "settings-accent", params: { page: "accent" } },
    phone: { screen: "/chapter-settings", anchor: "accent" },
  },
  {
    // Set from the phone's Chapter settings and, on web, from the Chat page's
    // Chat background row, which opens its own page (#6031).
    id: "chat-background",
    label: "Chat background",
    area: "chapter",
    section: "Chapter",
    keywords: ["wallpaper", "background", "chat theme", "pattern"],
    requires: CONFIG,
    web: { page: "chat", params: { page: "background" } },
    phone: { screen: "/chapter-settings", anchor: "chat-background" },
  },
  {
    id: "greek-letters",
    label: "Greek letters",
    area: "chapter",
    section: "Chapter",
    keywords: ["letters", "symbols"],
    requires: CONFIG,
    web: { page: "org", anchor: "greek-letters", params: { page: "identity" } },
    phone: {
      screen: "/chapter-identity",
      anchor: "greek-letters",
      chapterOnly: true,
    },
  },
  {
    id: "designation",
    label: "Chapter designation",
    area: "chapter",
    section: "Chapter",
    keywords: ["chapter letters", "which chapter"],
    requires: CONFIG,
    web: { page: "org", anchor: "designation", params: { page: "identity" } },
    phone: {
      screen: "/chapter-identity",
      anchor: "designation",
      chapterOnly: true,
    },
  },
  {
    id: "school-short",
    label: "School (short)",
    area: "chapter",
    section: "Chapter",
    keywords: ["school abbreviation", "university short name"],
    requires: CONFIG,
    web: { page: "org", anchor: "school-short", params: { page: "identity" } },
    phone: {
      screen: "/chapter-identity",
      anchor: "school-short",
      chapterOnly: true,
    },
  },
  {
    id: "founded-year",
    label: "Founded year",
    area: "chapter",
    section: "Chapter",
    keywords: ["founding", "founded", "established", "charter", "since"],
    requires: CONFIG,
    web: { page: "org", anchor: "founded-year", params: { page: "identity" } },
    phone: {
      screen: "/chapter-identity",
      anchor: "founded-year",
      chapterOnly: true,
    },
  },
  {
    id: "organization-type",
    label: "Organization type",
    area: "chapter",
    section: "Chapter",
    keywords: [
      "archetype",
      "fraternity",
      "sorority",
      "council",
      "nphc",
      "ifc",
      "panhellenic",
      "professional",
      "multicultural",
    ],
    requires: CONFIG,
    web: {
      page: "org",
      anchor: "settings-archetype",
      params: { page: "type" },
    },
    phone: {
      screen: "/chapter-settings",
      anchor: "organization-type",
      chapterOnly: true,
    },
  },
  {
    id: "vocabulary",
    label: "Vocabulary",
    area: "chapter",
    section: "Chapter",
    keywords: ["words", "terms", "terminology", "naming", "language"],
    requires: CONFIG,
    web: {
      page: "org",
      anchor: "settings-vocabulary",
      params: { page: "vocabulary" },
    },
    phone: {
      screen: "/chapter-settings",
      anchor: "vocabulary",
      chapterOnly: true,
    },
  },
  {
    id: "vocab-recruitment",
    label: "Recruitment process",
    area: "chapter",
    section: "Chapter",
    keywords: ["rush", "intake", "vocabulary"],
    requires: CONFIG,
    web: {
      page: "org",
      anchor: "vocab-recruitment",
      params: { page: "vocabulary" },
    },
    phone: {
      screen: "/chapter-vocabulary",
      anchor: "vocab-recruitment",
      chapterOnly: true,
    },
  },
  {
    id: "vocab-pledge",
    label: "New member term",
    area: "chapter",
    section: "Chapter",
    keywords: [
      "pledge",
      "new member",
      "aspirant",
      "candidate",
      "associate member",
      "vocabulary",
    ],
    requires: CONFIG,
    web: {
      page: "org",
      anchor: "vocab-pledge",
      params: { page: "vocabulary" },
    },
    phone: {
      screen: "/chapter-vocabulary",
      anchor: "vocab-pledge",
      chapterOnly: true,
    },
  },
  {
    id: "vocab-class",
    label: "Cohort label",
    area: "chapter",
    section: "Chapter",
    keywords: ["pledge class", "line", "class", "cohort", "vocabulary"],
    requires: CONFIG,
    web: { page: "org", anchor: "vocab-class", params: { page: "vocabulary" } },
    phone: {
      screen: "/chapter-vocabulary",
      anchor: "vocab-class",
      chapterOnly: true,
    },
  },
  {
    id: "vocab-order",
    label: "Member order number",
    area: "chapter",
    section: "Chapter",
    keywords: [
      "roll number",
      "bond number",
      "order number",
      "badge number",
      "scroll number",
      "vocabulary",
    ],
    requires: CONFIG,
    web: { page: "org", anchor: "vocab-order", params: { page: "vocabulary" } },
    phone: {
      screen: "/chapter-vocabulary",
      anchor: "vocab-order",
      chapterOnly: true,
    },
  },
  {
    id: "vocab-tier",
    label: "Role tier",
    area: "chapter",
    section: "Chapter",
    keywords: ["tier", "rank", "officer level", "vocabulary"],
    requires: CONFIG,
    web: { page: "org", anchor: "vocab-tier", params: { page: "vocabulary" } },
    phone: {
      screen: "/chapter-vocabulary",
      anchor: "vocab-tier",
      chapterOnly: true,
    },
  },
  {
    id: "birthday-posts",
    label: "Birthday posts",
    area: "chapter",
    section: "Chapter",
    keywords: ["birthday", "birthdays", "celebrate", "birthday channel"],
    requires: CONFIG,
    web: { page: "org", anchor: "birthday-channel" },
    phone: {
      screen: "/chapter-settings",
      anchor: "birthday-posts",
      chapterOnly: true,
    },
  },
  {
    id: "member-names",
    label: "Members can change their own name",
    area: "chapter",
    section: "Chapter",
    keywords: [
      "name",
      "names",
      "rename",
      "display name",
      "nickname",
      "impersonate",
      "lock names",
    ],
    requires: CONFIG,
    web: { page: "org", anchor: "settings-member-names" },
    phone: { screen: "/chapter-settings", anchor: "member-names" },
  },

  // ---- Semester, Privacy, AI, Plan and billing --------------------------
  {
    id: "new-semester",
    label: "Start a new semester",
    area: "chapter",
    section: "Semester",
    keywords: [
      "rollover",
      "new term",
      "new year",
      "end semester",
      "archive semester",
      "promote new members",
    ],
    // The rollover controller also carries `members:view` on its class.
    requires: ["members:view", "semester:rollover"],
    web: { page: "semester", anchor: "settings-start-a-new-semester" },
  },
  {
    id: "analytics",
    label: "Usage analytics",
    area: "chapter",
    section: "Privacy",
    keywords: ["analytics", "tracking", "telemetry", "privacy", "opt out"],
    requires: CONFIG,
    web: { page: "privacy", anchor: "settings-privacy" },
  },
  {
    // The record of officer changes (Paul, 2026-11-21), which was the
    // `#chapter-audit` channel. Read-only, so `requires` is what reading takes.
    id: "logs",
    label: "Logs",
    area: "chapter",
    section: "Logs",
    keywords: ["audit", "audit log", "history", "changes", "who changed"],
    requires: CHAPTER_LOGS_PERMISSIONS,
    web: { page: "logs" },
    phone: { screen: "/chapter-logs" },
  },
  {
    id: "chapter-ai",
    label: "AI features",
    area: "chapter",
    section: "AI",
    keywords: [
      "ai",
      "ask frapp",
      "frapp intelligence",
      "questions and requests",
      "assistant",
      "meeting notes",
      "transcription",
      "nudges",
      "chat as a source",
    ],
    requires: "president",
    needsAi: true,
    web: { page: "ai" },
    phone: { screen: "/chapter-settings", anchor: "ai" },
  },
  {
    id: "plan",
    label: "Plan",
    area: "chapter",
    section: "Plan and billing",
    keywords: [
      "subscription",
      "upgrade",
      "pricing",
      "billing",
      "payment method",
      "card",
    ],
    // The Billing tab and its controller both need `billing:view` as well.
    requires: ["billing:view", "billing:manage"],
    web: { page: "billing", anchor: "plan-panel-heading" },
  },
  {
    id: "chapter-invoices",
    label: "Chapter invoices",
    area: "chapter",
    section: "Plan and billing",
    keywords: ["receipts", "billing history", "payments", "invoice"],
    // Viewing alone changes nothing there, and search lists what can change.
    requires: ["billing:view", "billing:manage"],
    // The list is drawn only while dues is on (off for the beta), on its
    // own page of Plan and billing (#6031).
    betaModule: "dues",
    web: {
      page: "billing",
      anchor: "invoice-list-heading",
      params: { page: "invoices" },
    },
  },
  {
    id: "cancel-chapter",
    label: "Cancel or close the chapter",
    area: "chapter",
    section: "Plan and billing",
    keywords: [
      "cancel subscription",
      "delete chapter",
      "shut down",
      "downgrade",
    ],
    requires: ["billing:view", "billing:manage"],
    web: { page: "billing", anchor: "plan-cancel-or-close" },
  },

  // ---- People -----------------------------------------------------------
  {
    id: "roles",
    label: "Roles",
    area: "chapter",
    section: "Roles and groups",
    keywords: [
      "role",
      "positions",
      "officers",
      "exec",
      "permissions",
      "access",
      "titles",
      "tiers",
      "who can",
    ],
    requires: ["roles:manage"],
    web: { page: "roles" },
    phone: { screen: "/chapter-roles" },
  },
  {
    // Both apps add a role in its tier on Roles and groups (#6029; the
    // phone's Chapter settings row from #5296 is gone).
    id: "new-role",
    label: "New role",
    area: "chapter",
    section: "Roles and groups",
    keywords: ["create role", "add role", "make a role", "new position"],
    requires: ["roles:manage"],
    web: { page: "roles" },
    phone: { screen: "/chapter-roles" },
  },
  {
    id: "default-invite-role",
    label: "Default invite role",
    area: "chapter",
    section: "Roles and groups",
    keywords: [
      "invite",
      "new members join as",
      "joining role",
      "starting role",
    ],
    requires: CONFIG,
    web: { page: "roles", anchor: "default-invite-role" },
  },
  {
    id: "transfer-presidency",
    label: "Transfer presidency",
    area: "chapter",
    section: "Roles and groups",
    keywords: ["president", "hand over", "successor", "new president"],
    requires: "president",
    web: { page: "roles", anchor: "settings-transfer-presidency" },
  },
  {
    id: "groups",
    label: "Groups",
    area: "chapter",
    section: "Roles and groups",
    keywords: ["committees", "committee", "teams", "mention groups"],
    requires: ["groups:manage"],
    // One page with the roles since Paul's 2026-11-19 call, on both apps.
    web: { page: "roles", anchor: "settings-groups" },
    phone: { screen: "/chapter-roles" },
  },
  {
    id: "pledge-class",
    label: "Pledge class",
    area: "chapter",
    section: "Pledge class",
    keywords: [
      "line",
      "class",
      "new member class",
      "cohort",
      "order number",
      "roll number",
    ],
    // The row's gate (`chapterSettingsAccess`): the tab's `roles:manage`
    // with the `members:view` its list and roster reads take.
    requires: ["roles:manage", "members:view"],
    web: { page: "classes", anchor: "settings-classes" },
    // `/v1/pledge-classes` refuses a council (ChapterGuard).
    phone: { screen: "/pledge-classes", chapterOnly: true },
  },
  {
    id: "member-fields",
    label: "Member fields",
    area: "chapter",
    section: "Member fields",
    keywords: [
      "custom fields",
      "profile fields",
      "directory fields",
      "questions",
      "member info",
      "major",
      "shirt size",
    ],
    requires: CONFIG,
    web: { page: "fields", anchor: "settings-custom-member-fields" },
    phone: { screen: "/member-fields", chapterOnly: true },
  },

  // ---- One per module page, then what sits on them ----------------------
  ...MODULE_WORDS.map((module): SettingEntry => {
    // An always-on module (Chat, Announcements) has no switch to light or
    // turn off, so its page opens at the top and offers no switch words.
    const alwaysOn = module.alwaysOn;
    return {
      id: `module-${module.key}`,
      label: module.label,
      area: "chapter",
      section: "Modules",
      keywords: alwaysOn
        ? module.keywords
        : [...module.keywords, ...MODULE_SWITCH_WORDS],
      requires: CONFIG,
      betaModule: module.key,
      web: alwaysOn
        ? { page: module.key }
        : { page: module.key, anchor: `settings-module-${module.key}-switch` },
      // The module's screen on the phone (#6030), which reads the chapter's
      // config, so a council is sent to the web dashboard.
      phone: {
        screen: "/module-settings",
        params: { module: module.key },
        chapterOnly: true,
      },
    };
  }),
  {
    id: "channels",
    label: "Channels",
    area: "chapter",
    section: "Chat",
    keywords: [
      "chat admin",
      "create channel",
      "categories",
      "pins",
      "report queue",
      "moderation",
      "reported messages",
    ],
    requires: ["channels:manage"],
    web: { page: "chat", params: { page: "chat-admin" } },
  },
  {
    // The phone's Chapter settings row (#5296); web makes a channel from the
    // channel list, which the Channels entry opens.
    id: "new-channel",
    label: "New channel",
    area: "chapter",
    section: "Chat",
    keywords: ["create channel", "add channel", "make a channel"],
    requires: ["channels:create", "channels:manage"],
    web: { page: "chat", params: { page: "chat-admin" } },
    phone: { screen: "/chapter-settings", anchor: "new-channel" },
  },
  {
    id: "discord-import",
    label: "Discord import",
    area: "chapter",
    section: "Chat",
    keywords: ["discord", "import", "migrate", "history", "archive"],
    requires: ["channels:manage"],
    web: { page: "chat", params: { tool: "discord-import" } },
  },
  {
    id: "service-rules",
    label: "Service hours rules",
    area: "chapter",
    section: "Service hours",
    keywords: [
      "minutes per point",
      "hours to points",
      "rate",
      "approval",
      "approve",
      "receipt",
      "proof",
    ],
    requires: CONFIG,
    betaModule: "hours",
    web: { page: "hours", anchor: "settings-module-hours-rules" },
    phone: {
      screen: "/module-settings",
      params: { module: "hours" },
      chapterOnly: true,
    },
  },
  {
    id: "service-goals",
    label: "Service hours goal",
    area: "chapter",
    section: "Service hours",
    keywords: ["goal", "target", "requirement", "minimum", "quota"],
    requires: CONFIG,
    betaModule: "hours",
    web: {
      page: "hours",
      anchor: "settings-module-service-goals",
      params: { page: "goal-service" },
    },
    phone: {
      screen: "/module-settings",
      params: { module: "hours", page: "goal-service" },
      chapterOnly: true,
    },
  },
  {
    id: "study-goals",
    label: "Study hours goal",
    area: "chapter",
    section: "Service hours",
    keywords: ["goal", "target", "requirement", "study hours", "weekly"],
    requires: CONFIG,
    betaModule: "hours",
    web: {
      page: "hours",
      anchor: "settings-module-study-goals",
      params: { page: "goal-study" },
    },
    phone: {
      screen: "/module-settings",
      params: { module: "hours", page: "goal-study" },
      chapterOnly: true,
    },
  },
  {
    id: "study-zones",
    label: "Study zones",
    area: "chapter",
    section: "Study zones",
    keywords: ["geofence", "map", "library", "study area", "location"],
    requires: ["geofences:manage"],
    module: "geofences",
    web: {
      page: "geofences",
      anchor: "settings-module-geofences-zones",
      params: { page: "study-zones" },
    },
  },
  {
    id: "points-rules",
    label: "Points rules",
    area: "chapter",
    section: "Points",
    keywords: ["limits", "cap", "maximum", "max points", "daily limit"],
    requires: CONFIG,
    betaModule: "points",
    web: { page: "points", anchor: "settings-module-points-rules" },
    phone: {
      screen: "/module-settings",
      params: { module: "points" },
      chapterOnly: true,
    },
  },
  {
    id: "points-goal",
    label: "Points goal",
    area: "chapter",
    section: "Points",
    keywords: ["goal", "target", "requirement", "minimum", "quota"],
    requires: CONFIG,
    betaModule: "points",
    web: {
      page: "points",
      anchor: "settings-module-points-goals",
      params: { page: "goal-points" },
    },
    phone: {
      screen: "/module-settings",
      params: { module: "points", page: "goal-points" },
      chapterOnly: true,
    },
  },
  {
    id: "minutes-sections",
    label: "Sections in the minutes",
    area: "chapter",
    section: "Meetings",
    keywords: ["minutes template", "agenda", "officer reports", "minutes"],
    requires: CONFIG,
    // The template's write is refused while Meetings is off.
    module: "meetings",
    web: {
      page: "meetings",
      anchor: "settings-module-meetings-rules",
      params: { page: "sections" },
    },
    phone: {
      screen: "/module-settings",
      params: { module: "meetings", page: "sections" },
      chapterOnly: true,
    },
  },
  {
    id: "export-reports",
    label: "Export reports",
    area: "chapter",
    section: "Reports",
    keywords: ["csv", "spreadsheet", "download", "attendance report"],
    requires: ["reports:export"],
    module: "reports",
    web: { page: "reports", params: { page: "reports" } },
  },
  {
    id: "dues-amounts",
    label: "Dues amounts",
    area: "chapter",
    section: "Dues",
    keywords: [
      "fees",
      "cost",
      "installments",
      "payment plan",
      "late fee",
      "grace period",
      "scholarship",
    ],
    requires: CONFIG,
    betaModule: "dues",
    web: { page: "dues", anchor: "settings-dues" },
  },
];

const PERSONAL_ENTRIES: readonly SettingEntry[] = [
  {
    // Web has no push switch: a browser asks for its own.
    id: "push",
    label: "Push notifications",
    area: "personal",
    section: "Notifications",
    keywords: ["notifications", "alerts", "notify", "sounds"],
    phone: { screen: "/preferences", page: "notifications", anchor: "push" },
  },
  {
    id: "quiet-hours",
    label: "Quiet hours",
    area: "personal",
    section: "Notifications",
    keywords: ["do not disturb", "dnd", "sleep", "mute", "silence", "night"],
    web: { page: "notifications", anchor: "quiet-hours" },
    phone: {
      screen: "/preferences",
      page: "notifications",
      anchor: "quiet-hours",
    },
  },
  {
    id: "chat-notifications",
    label: "Chat messages",
    area: "personal",
    section: "Notifications",
    keywords: [
      "chat notifications",
      "mentions only",
      "all messages",
      "notify",
      "notification level",
    ],
    web: { page: "notifications", anchor: "chat-level-legend" },
    phone: {
      screen: "/preferences",
      page: "notifications",
      anchor: "chat-messages",
    },
  },
  {
    id: "chapter-alerts",
    label: "Chapter notifications",
    area: "personal",
    section: "Notifications",
    keywords: [
      "notifications",
      "alerts",
      "event reminders",
      "task reminders",
      "points",
      "weekly recap",
      "alert types",
    ],
    web: { page: "notifications", anchor: "chapter-alerts" },
    phone: {
      screen: "/preferences",
      page: "notifications",
      anchor: "chapter-alerts",
    },
  },
  {
    // The Activity card's switch is phone only: web's Activity has no nudge card.
    id: "nudges",
    label: "Nudges on Activity",
    area: "personal",
    section: "Notifications",
    keywords: ["nudges", "reminders", "activity card"],
    phone: { screen: "/preferences", page: "notifications", anchor: "nudges" },
  },
  {
    id: "chat-density",
    label: "Chat density",
    area: "personal",
    section: "Chat",
    keywords: ["compact", "cozy", "spacing", "layout", "dense", "appearance"],
    web: { page: "chat", anchor: "chat-density" },
    phone: { screen: "/preferences", page: "chat", anchor: "chat-density" },
  },
  {
    id: "read-receipts",
    label: "Read receipts",
    area: "personal",
    section: "Chat",
    keywords: ["seen", "read status", "privacy"],
    web: { page: "chat", anchor: "read-receipts" },
    phone: { screen: "/preferences", page: "chat", anchor: "read-receipts" },
  },
  {
    id: "linked-apps",
    label: "Linked apps",
    area: "personal",
    section: "Linked apps",
    keywords: ["discord", "google", "connect", "integrations", "link account"],
    web: { page: "apps", anchor: "linked-apps" },
    phone: { screen: "/preferences", page: "apps", anchor: "linked-apps" },
  },
  {
    id: "calendar",
    label: "Calendar apps",
    area: "personal",
    section: "Linked apps",
    keywords: [
      "calendar",
      "google calendar",
      "subscribe",
      "ical",
      "sync",
      "calendar feed",
      "outlook",
      "apple calendar",
    ],
    web: { page: "apps", anchor: "linked-apps" },
    phone: { screen: "/preferences", page: "apps", anchor: "linked-apps" },
  },
  {
    id: "frapp-ai",
    label: "Frapp Intelligence",
    area: "personal",
    section: "Frapp Intelligence",
    keywords: ["ai", "ask frapp", "assistant", "consent"],
    needsAi: true,
    web: { page: "ai", anchor: "ai" },
    phone: { screen: "/preferences", page: "ai", anchor: "ai" },
  },
  {
    id: "sign-in",
    label: "Sign in",
    area: "personal",
    section: "Account",
    keywords: ["password", "email", "google sign in", "apple sign in", "login"],
    web: { page: "account", anchor: "account" },
    phone: { screen: "/preferences", page: "account", anchor: "sign-in" },
  },
  {
    id: "sign-out",
    label: "Sign out",
    area: "personal",
    section: "Account",
    keywords: ["log out", "logout", "sign off"],
    web: { page: "account", anchor: "account" },
    phone: { screen: "/preferences", page: "account", anchor: "sign-out" },
  },
  {
    id: "delete-account",
    label: "Delete account",
    area: "personal",
    section: "Account",
    keywords: ["remove account", "close account", "deactivate", "erase data"],
    web: { page: "account", anchor: "account" },
    phone: {
      screen: "/preferences",
      page: "account",
      anchor: "delete-account",
    },
  },
  {
    id: "blocked-members",
    label: "Blocked members",
    area: "personal",
    section: "Blocked members",
    keywords: ["block", "unblock", "blocked users"],
    web: { page: "blocked", anchor: "blocked-members" },
    phone: { screen: "/preferences", anchor: "blocked" },
  },
  {
    id: "my-invoices",
    label: "My invoices",
    area: "personal",
    section: "My invoices",
    keywords: ["dues", "pay", "payments", "bills", "receipts"],
    betaModule: "dues",
    web: { page: "invoices", anchor: "my-invoices" },
  },
];

export const SETTINGS_INDEX: readonly SettingEntry[] = [
  ...CHAPTER_ENTRIES,
  ...PERSONAL_ENTRIES,
];

const BY_ID: ReadonlyMap<string, SettingEntry> = new Map(
  SETTINGS_INDEX.map((entry) => [entry.id, entry]),
);

export function settingEntryById(
  id: string | null | undefined,
): SettingEntry | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export type SettingsSearchContext = {
  /** The viewer's grants; nothing chapter-side is listed while unknown. */
  permissions: readonly string[] | null | undefined;
  /** Which platform is asking: web lists only what web can open. */
  platform: "web" | "phone";
  /** Whether the server has AI (`aiAvailableFrom`), `true` only. */
  aiAvailable?: boolean;
  /** A module's switch; undefined while unresolved, which lists nothing gated. */
  isModuleEnabled?: (moduleKey: string) => boolean;
  /** Only this area, for a page that searches its own settings. */
  area?: SettingsArea;
  /** False for a council: its phone has no Chapter tab pages (`chapterOnly`). */
  chapterFeatures?: boolean;
};

/**
 * Where a setting opens on the phone for this tenant, or `undefined` when
 * only the web dashboard has it there: a council has no Chapter tab parts
 * that read the chapter's config (`chapterOnly`).
 */
export function settingPhoneTarget(
  entry: SettingEntry,
  options: { chapterFeatures?: boolean } = {},
): SettingEntry["phone"] {
  if (entry.phone?.chapterOnly && options.chapterFeatures === false) {
    return undefined;
  }
  return entry.phone;
}

/** Whether this viewer could change it, on this platform or on the web. */
export function isSettingListed(
  entry: SettingEntry,
  ctx: SettingsSearchContext,
): boolean {
  if (ctx.area && entry.area !== ctx.area) return false;
  if (ctx.platform === "web" && !entry.web) return false;
  if (entry.needsAi && ctx.aiAvailable !== true) return false;
  if (entry.betaModule && isBetaOffModule(entry.betaModule)) return false;
  if (entry.module) {
    if (isBetaOffModule(entry.module)) return false;
    if (!ctx.isModuleEnabled?.(entry.module)) return false;
  }
  if (entry.requires === "president") {
    return !!ctx.permissions?.includes("*");
  }
  if (entry.requires) {
    return canAll(entry.requires, ctx.permissions);
  }
  return true;
}

/** Lower case, accents dropped, punctuation as spaces. */
export function normalizeSettingText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A plural and its singular match each other ("roles", "role"). */
function stem(word: string): string {
  return word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word;
}

/** At most one letter added, dropped, changed or swapped. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    // A swap of two neighbours.
    return (
      a[i] === b[i + 1] &&
      a[i + 1] === b[i] &&
      a.slice(i + 2) === b.slice(i + 2)
    );
  }
  return a.length > b.length
    ? a.slice(i + 1) === b.slice(i)
    : a.slice(i) === b.slice(i + 1);
}

/** How well one typed word fits one word of the entry; 0 for not at all. */
function wordScore(token: string, word: string): number {
  if (word === token || stem(word) === stem(token)) return 1;
  if (word.startsWith(token)) return 0.8;
  // A typo, once the word is long enough that one letter can't change it.
  if (token.length >= 5) {
    if (withinOneEdit(stem(token), stem(word))) return 0.6;
    if (
      word.length > token.length &&
      withinOneEdit(token, word.slice(0, token.length))
    ) {
      return 0.5;
    }
  }
  return 0;
}

type Haystack = { words: readonly string[]; weight: number };

function haystacksFor(entry: SettingEntry): Haystack[] {
  const split = (text: string) => normalizeSettingText(text).split(" ");
  return [
    { words: split(entry.label), weight: 3 },
    { words: entry.keywords.flatMap(split), weight: 2 },
    { words: split(entry.section), weight: 1 },
  ];
}

/** The entry's fit for the query, or 0 when a typed word matches nothing. */
export function scoreSetting(entry: SettingEntry, query: string): number {
  const needle = normalizeSettingText(query);
  if (!needle) return 0;
  const tokens = needle.split(" ");
  const haystacks = haystacksFor(entry);
  let total = 0;
  for (const token of tokens) {
    let best = 0;
    for (const { words, weight } of haystacks) {
      for (const word of words) {
        best = Math.max(best, wordScore(token, word) * weight);
      }
    }
    if (best === 0) return 0;
    total += best;
  }
  const label = normalizeSettingText(entry.label);
  if (label === needle) total += 10;
  else if (label.startsWith(needle)) total += 5;
  else if (
    entry.keywords.some((keyword) => normalizeSettingText(keyword) === needle)
  ) {
    total += 3;
  }
  return total;
}

export type SettingMatch = {
  entry: SettingEntry;
  /** `"Chapter settings · Roles"`: where it lives, as the pages name it. */
  hint: string;
  /** False on the phone for a setting only the web dashboard changes. */
  opensHere: boolean;
};

export function settingHint(entry: SettingEntry): string {
  return `${SETTINGS_AREA_LABELS[entry.area]} · ${entry.section}`;
}

/**
 * The settings that match, best first, of those this viewer can change. Ties
 * keep the index's order, which is the pages' order.
 */
export function searchSettings(
  query: string,
  ctx: SettingsSearchContext,
  limit = 12,
): SettingMatch[] {
  if (!normalizeSettingText(query)) return [];
  return SETTINGS_INDEX.map((entry, index) => ({
    entry,
    index,
    score: isSettingListed(entry, ctx) ? scoreSetting(entry, query) : 0,
  }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ entry }) => ({
      entry,
      hint: settingHint(entry),
      opensHere:
        ctx.platform === "web"
          ? !!entry.web
          : !!settingPhoneTarget(entry, {
              chapterFeatures: ctx.chapterFeatures,
            }),
    }));
}

/**
 * The dashboard address that opens a setting, lit: a path, so web can push it
 * and the phone can put its web origin in front.
 */
export function settingWebPath(entry: SettingEntry): string | null {
  if (!entry.web) return null;
  const params = new URLSearchParams();
  params.set(entry.area === "chapter" ? "tab" : "section", entry.web.page);
  for (const [key, value] of Object.entries(entry.web.params ?? {})) {
    params.set(key, value);
  }
  params.set("setting", entry.id);
  const path = entry.area === "chapter" ? "/settings" : "/preferences";
  return `${path}?${params.toString()}`;
}
