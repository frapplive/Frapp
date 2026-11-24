import {
  ActivityGlyph,
  ChatGlyph,
  DirectMessagesGlyph,
  DirectoryGlyph,
  DocumentsGlyph,
  EventsGlyph,
  PointsGlyph,
  RecruitmentGlyph,
  ServiceGlyph,
  StudyGlyph,
  TasksGlyph,
  type NavGlyphComponent,
} from "@/components/layout/nav-glyphs";
import type { UnsetFeatureKey } from "@repo/hooks";
import { vocab, type VocabConfig, type VocabKey } from "@repo/org-archetypes";
import { SECTION_NAMES, type TenantKind } from "@repo/validation";

/**
 * Permission-aware dashboard navigation.
 *
 * Kept in a single module so the sidebar and the mobile drawer stay in sync.
 * It also names the open page: `page-title.ts` reads each row's label as the
 * top bar's title, so the row and the heading cannot disagree. (There is no
 * command palette; #2141 deleted it.) The row-by-row table in `spec/ui/web-dashboard/README.md`
 * § Navigation map mirrors this file, and a change to one changes the other.
 *
 * Structure (#2946): a Chat anchor with no section header, then Chapter, then
 * the Resources row (one row since #5949), then one unlabeled group holding Directory. Chat leads because chat is the product's home — `/` and
 * `/dashboard` both redirect there. The anchor holds two rows since #3774
 * (Shawn, 2026-11-12): Chat, then Direct messages, which opens the same chat
 * panel on the member's conversations instead of the chapter's channels, the
 * way Slack's DMs entry and Discord's Direct Messages home sit apart from the
 * channel list. Its `href` is the link it is below the side-by-side width,
 * `/chat?view=direct` (`CHAT_VIEW_PARAM`). Profile and the personal Settings page are
 * deliberately absent: they live in the account menu, which the shell hangs
 * off the top-bar avatar (`account-menu.tsx`), because they are about the
 * viewer, not about the chapter. That is the two doors (#3856). Chapter
 * settings is the other door, and it has no row here: it opens from the
 * chapter menu atop this list (`chapter-nav-header.tsx`), beside switching
 * and joining chapters, the way Slack's workspace menu and Discord's server
 * menu hold their settings (Paul, 2026-11-19: one place, not two).
 *
 * **The nav fits a 1024×768 window for every seeded role.** A six-row Admin
 * group (Roles, Study Zones, Reports, Chat Admin, Discord Import, Settings)
 * used to close the list. For a President it needed an 828px-tall window and
 * scrolled on a 768px one. It folded into Chapter settings: Roles is a Settings
 * tab, and the four officer tools keep their own pages behind the Settings rail
 * (`components/settings/settings-access.ts`). Adding a row costs 36px of that
 * budget, and `tests/visual/nav-fit.spec.ts` fails the build when the nav no
 * longer fits.
 *
 * There is no `primaryActionLabel`. The shell used to render one per route as a
 * header button, but `primaryActionHref` resolved to the route already open, so
 * it was a link to the current page — and every such action is also reachable
 * inside the page. The board deletes it (`1t`, "per-route primaryActionLabel").
 *
 * Permission semantics:
 * - `requirePermission` — a single permission string; hide when absent.
 * - `requireAnyOf` — shown when the caller holds at least one listed.
 * - `requireAllOf` — shown only when the caller holds every one listed.
 * - Omitting all three renders the item unconditionally.
 *
 * Every row links to a built route. There are no roadmap rows: a row drawn
 * disabled with nothing behind it is a dead-end control, and the "Coming soon"
 * branch that drew one had no producer left when it was deleted (#3089).
 *
 * Module gating:
 * - `module` — the `enabled_modules` key (see `@repo/org-archetypes`
 *   `MODULE_CATALOG`) that gates this item. When the chapter disables the
 *   module in Settings → Modules, the item is hidden from the sidebar. Items
 *   without a `module` are always-on or governed purely by permission. Hiding
 *   is fail-safe: while the chapter read is still loading the item stays
 *   visible. The shell reads module state from the member-readable current
 *   chapter (`lib/hooks/use-chapter-module-gate.ts`), not the officer-only
 *   config read.
 *
 * Setup gating:
 * - `hiddenUntilSetUp` — a feature that is on but that nobody has set up yet
 *   hides, since its page could only say so (`useHiddenUnsetFeatures` in
 *   `@repo/hooks`; `spec/product/modules.md` § Not-set-up features).
 *   Documents with nothing in it hides from a viewer who can't upload; Study
 *   hours with no active zone hides from everyone, because zones are made in
 *   the Study zones tool, not on its page. Nothing hides while permissions,
 *   modules or the list are still loading, or after the list's read fails.
 *
 * Tenant-kind gating (#5933):
 * - `kinds` — the tenant kinds a row serves. Omitted, a row is a chapter's
 *   only. A council (ADR-27) is a tenant served by chat, members, roles,
 *   invites and the audit log, and every other chapter route answers it 403
 *   (`chapter.context.invalid`), so a council's nav shows only the rows that
 *   name `council` here: Chat, Direct messages and Directory. Activity, which
 *   has no module to switch off, is the row this gate exists for. Opt-in, so
 *   a new chapter row never reaches a council by default. While the kind is
 *   unknown nothing hides, as with the module gate (`useTenantKind`).
 *
 * Section gating is derived, never declared: a section renders only when at
 * least one of its items survives every gate (`isNavItemVisible` in
 * `protected-nav-item.tsx`), so a heading never announces an empty group.
 */

type NavPermissionRule =
  | {
      requirePermission?: undefined;
      requireAnyOf?: undefined;
      requireAllOf?: undefined;
    }
  | {
      requirePermission: string;
      requireAnyOf?: undefined;
      requireAllOf?: undefined;
    }
  | {
      requirePermission?: undefined;
      requireAnyOf: readonly string[];
      requireAllOf?: undefined;
    }
  | {
      requirePermission?: undefined;
      requireAnyOf?: undefined;
      requireAllOf: readonly string[];
    };

export type NavItem = {
  id: string;
  label: string;
  /** A Signet duotone glyph (`nav-glyphs.tsx`) — the intent → glyph map is `iconography.md` §6.2. */
  icon: NavGlyphComponent;
  href: string;
  description?: string;
  /** `enabled_modules` key that gates this item; omit for always-on items. */
  module?: string;
  /**
   * `enabled_modules` keys of which any one being on shows this item: for a
   * row that holds several modules' views (Resources, #2956). An item sets
   * this or `module`, never both.
   */
  anyModule?: readonly string[];
  /**
   * Other routes whose pages sit under this row, beside `href` and the pages
   * below it: the row is lit on them and names their parent
   * (`navItemHolds`). Resources holds `/backwork` and `/meetings`.
   */
  routes?: readonly string[];
  /**
   * Hide from a member until an officer sets the feature up (see "Setup
   * gating" above). Omit for a feature that works with nothing in it.
   */
  hiddenUntilSetUp?: UnsetFeatureKey;
  /** The tenant kinds this row serves; omitted, chapters only (above). */
  kinds?: readonly TenantKind[];
  /**
   * Named in the chapter's own word (`vocab()` in `@repo/org-archetypes`):
   * the recruitment row reads Rush, Recruitment or Intake as the chapter
   * calls it, never a hardcoded "Rush" (`spec/behavior/rush.md` §
   * Vocabulary). `label` is then the IFC default, what shows before the
   * chapter read answers. Resolve it with {@link navItemLabel}.
   */
  vocabLabel?: VocabKey;
} & NavPermissionRule;

/** A row a council's space shows as well as a chapter's. */
const EVERY_TENANT: readonly TenantKind[] = ["chapter", "council"];

/** A row's label in the chapter's words (see `vocabLabel`). */
export function navItemLabel(
  item: Pick<NavItem, "label" | "vocabLabel">,
  vocabulary?: VocabConfig,
): string {
  return item.vocabLabel ? vocab(item.vocabLabel, vocabulary) : item.label;
}

/** The row with its label in the chapter's words. */
export function withChapterWords(
  item: NavItem,
  vocabulary?: VocabConfig,
): NavItem {
  return item.vocabLabel
    ? { ...item, label: navItemLabel(item, vocabulary) }
    : item;
}

export type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
  /**
   * Anchor sections render their items with no heading. Used for Chat, which
   * is the app's home rather than a member of any group.
   */
  anchor?: boolean;
};

/** Where the Resources row opens: Documents, the page's first view. */
export const RESOURCES_HREF = "/documents";

/**
 * Whether `pathname` is the item's own page or one under it: its `href`, a
 * page below that, or one of its `routes` and the pages below those.
 */
export function navItemHolds(
  item: Pick<NavItem, "href" | "routes">,
  pathname: string,
): boolean {
  return [item.href, ...(item.routes ?? [])].some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export const DASHBOARD_NAV: NavSection[] = [
  {
    id: "anchor",
    label: "Chat",
    anchor: true,
    items: [
      {
        id: "chat",
        label: "Chat",
        icon: ChatGlyph,
        href: "/chat",
        description: "The chapter's channels and announcements.",
        kinds: EVERY_TENANT,
      },
      {
        id: "direct",
        label: "Direct messages",
        icon: DirectMessagesGlyph,
        href: "/chat?view=direct",
        description: "Your one-to-one and group conversations.",
        kinds: EVERY_TENANT,
      },
    ],
  },
  {
    id: "chapter",
    label: "Chapter",
    items: [
      {
        // What is waiting on the viewer and what they made, gathered from
        // the modules below (#3897). It leads the group because it is the
        // inbox for the rest of it. No `module`: the page spans modules, and
        // its read leaves out any that are off. No permission either: the
        // read needs `members:view`, which every member role holds.
        id: "activity",
        label: SECTION_NAMES.activity,
        icon: ActivityGlyph,
        href: "/activity",
        description: "Your week, what is left to do, and what you made.",
      },
      {
        id: "events",
        label: "Events",
        icon: EventsGlyph,
        href: "/events",
        description: "Schedule, attendance and check-ins.",
        module: "events",
      },
      {
        id: "tasks",
        label: "Tasks",
        icon: TasksGlyph,
        href: "/tasks",
        description: "Assign, track, and confirm chapter tasks.",
        module: "tasks",
      },
      {
        id: "points",
        label: "Points",
        icon: PointsGlyph,
        href: "/points",
        description: "Leaderboard, transactions, anomaly audit.",
        module: "points",
      },
      {
        id: "study",
        label: "Study hours",
        icon: StudyGlyph,
        href: "/study",
        description: "Start a tracked study session inside a study zone.",
        module: "hours",
        hiddenUntilSetUp: "study",
      },
      {
        id: "service",
        label: "Service hours",
        icon: ServiceGlyph,
        href: "/service",
        description: "Log service hours and approve entries for points.",
        module: "hours",
      },
      {
        // The recruitment pipeline (#5924): a board and a list of prospects.
        // Its routes need `members:view` and `rush:view` with the module on
        // (`rush-pipeline.controller.ts`), so the row asks for both.
        id: "rush",
        label: vocab("recruitment"),
        vocabLabel: "recruitment",
        icon: RecruitmentGlyph,
        href: "/rush",
        description: "Prospects by stage, with tags, ratings and notes.",
        module: "rush",
        requireAllOf: ["members:view", "rush:view"],
      },
    ],
  },
  {
    /*
     * One row for what the chapter keeps (#5949, step 5 of #5943; Paul,
     * 2026-11-24: "resources could be consolidated into one tab"). It opens
     * Documents, where a meeting's posted minutes are filed beside the
     * chapter's files, and Backwork is the page's other view
     * (`components/documents/resources-views.tsx`). Until then this group was
     * three rows: Meetings, Documents and Backwork (#2956 asked to merge the
     * last two). The row is the group, so the group has no heading.
     */
    id: "resources",
    label: SECTION_NAMES.resources,
    anchor: true,
    items: [
      {
        id: "resources",
        label: SECTION_NAMES.resources,
        icon: DocumentsGlyph,
        href: RESOURCES_HREF,
        description: "Documents, minutes and backwork.",
        // Shown while any of the three is on: the page offers each view only
        // to a member who can open it. No permission and no setup gate: every
        // member reads Documents, and an empty one is an officer's to start.
        anyModule: ["documents", "meetings", "backwork"],
        // Backwork and its Bulk upload, and a meeting's minutes, are pages
        // under this row, so it stays lit on them (rulebook § 8).
        routes: ["/backwork", "/meetings"],
      },
    ],
  },
  {
    /*
     * Directory sits in its own UNLABELED group.
     *
     * Directory and Billing were two sections of one item each, so the
     * headings "DIRECTORY" and "FINANCE" were each announcing a single row
     * whose own label already said the same word. The framework board (option
     * `1b`) merged them and dropped both headings; `1t` lists the two labels as
     * deleted chrome. Settings joined them when the Admin group folded into it
     * (#2946). Billing then left the sidebar for Chapter settings' Plan and
     * billing row (#3827): a president checks the plan once a semester, which
     * is not a daily nav destination. Chapter settings left it for the
     * chapter menu atop the nav (Paul, 2026-11-19), which already linked it.
     * The group keeps a wider top margin so it still reads as its own block.
     *
     * `anchor` is the existing "render items with no heading" flag, the same
     * one Chat uses. It is not a claim that this group is an app home.
     */
    id: "directory",
    label: SECTION_NAMES.directory,
    anchor: true,
    items: [
      {
        id: "members",
        label: SECTION_NAMES.directory,
        icon: DirectoryGlyph,
        href: "/members",
        description:
          "Actives and alumni, profile cards, invites, deactivation.",
        requirePermission: "members:view",
        kinds: EVERY_TENANT,
      },
    ],
  },
];

/** Every nav row, flattened (the plan matrix reads their `module` keys). */
export const DASHBOARD_NAV_ITEMS: NavItem[] = DASHBOARD_NAV.flatMap(
  (section) => section.items,
);
