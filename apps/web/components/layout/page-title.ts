import type { TenantKind } from "@repo/validation";
import { ASK_ROUTE } from "@/components/layout/shell-layout";
import type { VocabConfig } from "@repo/org-archetypes";
import { MINUTES_DOCUMENTS_HREF } from "@/components/documents/document-links";
import {
  DASHBOARD_NAV_ITEMS,
  navItemHolds,
  navItemLabel,
  type NavItem,
} from "@/components/layout/nav-config";

/**
 * The open route's title, as the top bar shows it.
 *
 * The title is derived from the route here, in one place, rather than passed
 * up by each page. That is what puts it on every path a route can take:
 * loading, offline, error and denied all render the same heading, because none
 * of them has to remember to. A page passing its own title was the old shape
 * (`PageHeader`), and the duty to render it on every branch was the part pages
 * kept dropping.
 *
 * **Where the words come from.** A nav route's title is its row's label, so the
 * row a member clicked and the heading they land on say the same words.
 * Profile, which has no nav row, is named below. Each route
 * also names its browser tab in its own `metadata.title`; the two are kept to
 * the same words, and `page-title.spec.ts` checks them against each other.
 *
 * **A parent only where there is a page to go back to** (2026-11-05). A page
 * reached from inside a nav row's own page reads "Backwork › Bulk upload"
 * (`SUB_PAGE_TITLES`), named and linked exactly as that row is, and the parent
 * shows only when that row does. The officer tools (Chat admin, Discord
 * import, Study zones, Reports) used to read "Chapter settings › Reports" from
 * routes of their own; they open inside Chapter settings now (#3837), whose
 * rail says where the officer is, so they need no title here. A
 * top-level route has no parent: prefixing the chapter name ("Phi Gamma Delta ›
 * Study hours") would repeat the chapter switcher that sits beside it in the
 * nav, and a caret that leads nowhere new is decoration.
 */

type PageTitleParent = { label: string; href: string };

export type PageTitle = {
  title: string;
  parent?: PageTitleParent;
};

/**
 * Routes that are not nav rows. Profile and the personal Settings page hang
 * off the account menu; Chapter settings opens from the chapter menu atop the
 * nav, under the words that menu item uses; Frapp Intelligence from the Ask bar.
 */
/**
 * Settings' name in each tenant kind, as the chapter menu's item and the top
 * bar both say it: a council's is "Council settings" (#5933).
 */
export const SETTINGS_TITLE: Readonly<Record<TenantKind, string>> = {
  chapter: "Chapter settings",
  council: "Council settings",
};

const OFF_NAV_TITLES: Readonly<Record<string, string>> = {
  "/profile": "Profile",
  "/preferences": "Settings",
  "/settings": SETTINGS_TITLE.chapter,
  "/whats-new": "What's new",
  // Opened from the Ask bar at the sidebar's foot (Paul, 2026-11-22).
  [ASK_ROUTE]: "Frapp Intelligence",
};

/**
 * Pages under a nav row that read as their own step, each with the page it
 * goes back to, titled under that row ("Resources › Bulk upload") and linked
 * only for a viewer who can open that page: Bulk upload goes back to
 * Backwork, the view it was opened from (#5949, Resources).
 */
const SUB_PAGE_TITLES: Readonly<Record<string, { title: string; back: string }>> =
  {
    "/backwork/upload": { title: "Bulk upload", back: "/backwork" },
  };

/**
 * Pages one record deep under a nav row, matched by prefix: any
 * `/meetings/<id>` is that meeting's "Minutes", under Resources.
 */
const RECORD_PAGE_TITLES: Readonly<
  Record<string, { title: string; back: string }>
> = {
  // Back to the chapter's minutes in Documents (#5949).
  "/meetings/": { title: "Minutes", back: MINUTES_DOCUMENTS_HREF },
};

/** `matchesRoute` for an off-nav or sub-page route. */
function matchesRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * @param isNavItemVisible whether the nav shows a row to this viewer
 *   (`isNavItemVisible` in `protected-nav-item.tsx`, bound to their
 *   permissions and modules). Omitted, every parent shows.
 * @param vocabulary the chapter's words, for a row named by them
 *   (`vocabLabel`, Recruitment's Rush / Intake). Omitted, the IFC default.
 * @param tenantKind the active tenant's kind: a council's Settings reads
 *   "Council settings".
 */
export function resolvePageTitle(
  pathname: string | null,
  isNavItemVisible: (item: NavItem) => boolean = () => true,
  vocabulary?: VocabConfig,
  tenantKind?: TenantKind,
): PageTitle | null {
  if (!pathname) return null;
  if (tenantKind === "council" && matchesRoute(pathname, "/settings")) {
    return { title: SETTINGS_TITLE.council };
  }

  const navItem = DASHBOARD_NAV_ITEMS.find((item) =>
    navItemHolds(item, pathname),
  );
  const subPage =
    Object.entries(SUB_PAGE_TITLES).find(([href]) =>
      matchesRoute(pathname, href),
    ) ??
    Object.entries(RECORD_PAGE_TITLES).find(
      ([prefix]) =>
        pathname.startsWith(prefix) && pathname.length > prefix.length,
    );
  if (navItem && subPage) {
    // The link goes to the view the page came from, so it shows only to a
    // viewer who can open that view: Bulk upload's crumb leads to Backwork,
    // which the Resources row's other view (Documents) doesn't vouch for.
    const backPath = subPage[1].back.split("?")[0] ?? subPage[1].back;
    const backView = navItem.views?.find((view) =>
      matchesRoute(backPath, view.href),
    );
    const parentShown = isNavItemVisible(
      backView ? { ...navItem, views: [backView] } : navItem,
    );
    return parentShown
      ? {
          title: subPage[1].title,
          parent: {
            label: navItemLabel(navItem, vocabulary),
            href: subPage[1].back,
          },
        }
      : { title: subPage[1].title };
  }
  if (navItem) return { title: navItemLabel(navItem, vocabulary) };

  const offNav = Object.entries(OFF_NAV_TITLES).find(([href]) =>
    matchesRoute(pathname, href),
  );
  if (offNav) return { title: offNav[1] };

  return null;
}
