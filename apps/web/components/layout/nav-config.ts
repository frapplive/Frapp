import {
  ActivityGlyph,
  ChaptersGlyph,
  DirectMessagesGlyph,
  DirectoryGlyph,
  DocumentsGlyph,
  EventsGlyph,
  RecruitmentGlyph,
  type NavGlyphComponent,
} from "@/components/layout/nav-glyphs";
import { vocab, type VocabConfig, type VocabKey } from "@repo/org-archetypes";
import { SECTION_NAMES, type TenantKind } from "@repo/validation";
import { MESSAGES_ROUTE } from "@/components/layout/shell-layout";

/**
 * The sidebar's rows (#5946, Paul 2026-11-24; `spec/ui/web-dashboard/README.md`
 * § Navigation map mirrors this file, and a change to one changes the other).
 *
 * A member opens Frapp with one of three questions, and each has one home
 * (`spec/product/positioning.md` § Three questions). The sidebar is those
 * homes and nothing else, the same for every role:
 *
 * - **New** and **Search** lead, and are not in this file: New opens Frapp
 *   Intelligence's page with what New starts under its field, and Search
 *   opens Find (`sidebar.tsx`).
 * - **Activity** and **Calendar** answer what is on me and what is happening,
 *   **Messages** what is being said to me, **Resources** and **Directory**
 *   where it is and who it is (`SIDEBAR_ROWS`).
 * - **The chapter's channels** follow, in the rest of the column, always in
 *   view (`chat-shell.tsx` draws the list into the sidebar).
 *
 * There are no section headings: five rows need none, and a heading over
 * each pair spent 37px the channel list wants.
 *
 * **`MORE_ROWS` is temporary.** Tasks folded into Activity in #5948 (Mine and
 * Everyone's; `/tasks` redirects there). Meetings and Backwork folded into Resources in #5949: posted minutes
 * are filed in Documents, and Backwork is Resources' second view. Points, Study hours and Service
 * hours left with #5950, onto the person: Profile and the Directory. Recruitment (#5924) landed after
 * the series was planned and has no home in it yet. Until its step lands a page stays
 * reachable from the More row, a dropdown under its button, so no page is
 * orphaned mid-series. A step deletes its rows here and nothing else; when
 * the list is empty the More row and this export go.
 *
 * What is deliberately absent: Profile, the personal Settings page, Chapter
 * settings, joining and switching chapters, and What's new all open from the
 * member's menu at the sidebar's foot (`account-menu.tsx`), one menu for the
 * member and the chapter, where Claude, Slack and Discord keep theirs.
 *
 * It also names the open page: `page-title.ts` reads each row's label as the
 * page's heading, so the row and the heading cannot disagree.
 *
 * **The channel list keeps at least eight rows at 1024x768** for every
 * seeded role, and `tests/visual/nav-fit.spec.ts` fails the build when the
 * fixed rows grow into that. A row costs 36px.
 *
 * Permission semantics:
 * - `requirePermission` — a single permission string; hide when absent.
 * - `requireAnyOf` — shown when the caller holds at least one listed.
 * - `requireAllOf` — shown only when the caller holds every one listed.
 * - Omitting all three renders the item unconditionally.
 *
 * Every row links to a built route. There are no roadmap rows: a row drawn
 * disabled with nothing behind it is a dead-end control (#3089).
 *
 * Module gating:
 * - `module` — the `enabled_modules` key (see `@repo/org-archetypes`
 *   `MODULE_CATALOG`) that gates this item. When the chapter disables the
 *   module in Settings → Modules, the item is hidden. Items without a
 *   `module` are always-on or governed purely by permission. Hiding is
 *   fail-safe: while the chapter read is still loading the item stays
 *   visible. The shell reads module state from the member-readable current
 *   chapter (`lib/hooks/use-chapter-module-gate.ts`), not the officer-only
 *   config read.
 *
 * No setup gate: the web sidebar's last one, Documents hiding from a viewer
 * who can't upload while it was empty, went in #5949, since posted minutes
 * are filed there. The phone's You tab keeps it (`useHiddenUnsetFeatures`,
 * `spec/product/modules.md` § Not-set-up features).
 *
 * Tenant-kind gating (#5933):
 * - `kinds` — the tenant kinds a row serves. Omitted, a row is a chapter's
 *   only. A council (ADR-27) is a tenant served by chat, members, roles,
 *   invites and the audit log, and every other chapter route answers it 403
 *   (`chapter.context.invalid`), so a council's sidebar keeps only the rows
 *   that name `council` here, Messages, Chapters and Directory, beside New, Search and
 *   the channel list (`sidebar.tsx`). Activity, which has no module to switch
 *   off, is the row this gate exists for. Opt-in, so a new chapter row never
 *   reaches a council by default. While the kind is unknown nothing hides,
 *   as with the module gate (`useTenantKind`), except a council-only row
 *   (Chapters, #5974), which waits for the answer, so a chapter never sees
 *   it drawn and taken back.
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

/**
 * One view a row opens (Resources' Documents and Backwork, #2956): the route,
 * the modules of which any one being on offers it, and who may open it.
 */
export type NavView = {
  href: string;
  anyModule: readonly string[];
} & NavPermissionRule;

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
   * For a row that holds several modules' views (Resources, #2956): the row
   * shows while the viewer can open any one of them, and opens the first they
   * can (`navItemTarget`), so a chapter with only Backwork on still reaches it
   * from the row. `href` is then the first view's, the row's target before
   * permissions answer. An item sets this or `module`, never both.
   */
  views?: readonly NavView[];
  /**
   * Other routes whose pages sit under this row, beside `href` and its views
   * and the pages below them: the row is lit on them and names their parent
   * (`navItemHolds`). Resources holds `/meetings`, a meeting's minutes.
   */
  routes?: readonly string[];
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

/** Where the Resources row opens: Documents, the page's first view. */
export const RESOURCES_HREF = "/documents";

/** Resources' views, in the order its header names them. */
export const RESOURCES_VIEWS: readonly NavView[] = [
  { href: RESOURCES_HREF, anyModule: ["documents", "meetings"] },
  {
    href: "/backwork",
    anyModule: ["backwork"],
    requireAnyOf: ["backwork:upload", "backwork:admin"],
  },
];

/**
 * Whether `pathname` is the item's own page or one under it: its `href`, one
 * of its views, one of its `routes`, or a page below any of those.
 */
export function navItemHolds(
  item: Pick<NavItem, "href" | "routes" | "views">,
  pathname: string,
): boolean {
  return [
    item.href,
    ...(item.views ?? []).map((view) => view.href),
    ...(item.routes ?? []),
  ].some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/** The rows between Search and the channel list, in order. */
export const SIDEBAR_ROWS: NavItem[] = [
  {
    // What is waiting on the viewer and what they made, gathered from the
    // modules (#3897). No `module`: the page spans modules, and its read
    // leaves out any that are off. No permission either: the read needs
    // `members:view`, which every member role holds.
    id: "activity",
    label: SECTION_NAMES.activity,
    icon: ActivityGlyph,
    href: "/activity",
    description: "Your week, what is left to do, and what you made.",
  },
  {
    // The member's direct and group conversations, the web twin of the
    // phone's Messages tab. Its count is conversations with anything unread.
    id: "messages",
    label: SECTION_NAMES.messages,
    icon: DirectMessagesGlyph,
    href: MESSAGES_ROUTE,
    description: "Your one-to-one and group conversations.",
    kinds: EVERY_TENANT,
  },
  {
    id: "events",
    label: SECTION_NAMES.calendar,
    icon: EventsGlyph,
    href: "/events",
    description: "Schedule, attendance and check-ins.",
    module: "events",
  },
  {
    /*
     * One row for what the chapter keeps (#5949, step 5 of #5943; Paul,
     * 2026-11-24: "resources could be consolidated into one tab"). It opens
     * Documents, where a meeting's posted minutes are filed beside the
     * chapter's files, and Backwork is the page's other view
     * (`components/documents/resources-views.tsx`).
     *
     * Documents while Documents or Meetings is on (minutes are filed there),
     * for every member: no permission and no setup gate, since an empty
     * library is an officer's to start and a chapter with only minutes still
     * has something to read. Backwork for a member who can browse it (the
     * API's gate). The row shows while either view is open, and opens the
     * first that is.
     */
    id: "resources",
    label: SECTION_NAMES.resources,
    icon: DocumentsGlyph,
    href: RESOURCES_HREF,
    description: "Documents, minutes and backwork.",
    views: RESOURCES_VIEWS,
    // A meeting's minutes are pages under this row, as are Backwork's Bulk
    // upload and the views, so it stays lit on them (rulebook § 8).
    routes: ["/meetings"],
  },
  {
    // A council's member chapters, requests and invitations (#5974;
    // `council-types.md` § What each council's space shows). Every
    // council member reads it; `council:chapters_manage` acts on it.
    id: "chapters",
    label: "Chapters",
    icon: ChaptersGlyph,
    href: "/chapters",
    description: "Member chapters, requests to join and invitations.",
    requirePermission: "members:view",
    kinds: ["council"],
  },
  {
    id: "members",
    label: SECTION_NAMES.directory,
    icon: DirectoryGlyph,
    href: "/members",
    description: "Actives and alumni, profile cards, invites, deactivation.",
    requirePermission: "members:view",
    kinds: EVERY_TENANT,
  },
];

/**
 * Pages a later step of #5943 folds into a row above, reachable from the
 * More row until then (see the header). A step deletes its own rows.
 */
export const MORE_ROWS: NavItem[] = [
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
];

/** Every page with a row, flattened (titles, and the plan matrix's modules). */
export const DASHBOARD_NAV_ITEMS: NavItem[] = [...SIDEBAR_ROWS, ...MORE_ROWS];
