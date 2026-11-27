import { describe, expect, it } from "vitest";
import { DASHBOARD_NAV_ITEMS } from "@/components/layout/nav-config";
import { currentFor } from "@/components/layout/sidebar";
import { resolvePageTitle } from "@/components/layout/page-title";
import { dashboardRoutes } from "@/components/layout/dashboard-routes";

/**
 * Every page has a way back and the sidebar says where you are (rulebook § 8,
 * Paul 2026-11-20: a meeting's minutes opened with no X, no back and nothing
 * lit in the sidebar). Walks every route under `app/(dashboard)`, so a new
 * page fails here until it has both, instead of reaching Paul first.
 *
 * - Title: the page header draws its title and its close (`ToolPageHeader`)
 *   from `resolvePageTitle`; a route it can't name opens untitled.
 * - Sidebar: a nav row is current on the route or a route under it (a page
 *   still under More lights More, `sidebar.tsx`), or the route is one of the
 *   doors outside the nav listed below.
 */

/**
 * The conversation is the shell's own page, with no tool page to close:
 * alone on `/chat`, and beside its list on Messages, which lights its row.
 */
const NOT_A_TOOL_PAGE = new Set(["/", "/chat", "/messages"]);

/**
 * Pages outside the sidebar, and the door each opens from. A page here still
 * needs a title (so its header has a close); it just has no row to light.
 */
const OFF_NAV_DOORS: Readonly<Record<string, string>> = {
  "/profile": "the member's menu at the sidebar's foot",
  "/preferences": "the member's menu at the sidebar's foot",
  "/settings": "the member's menu at the sidebar's foot",
  "/affiliations": "the member's menu at the sidebar's foot",
  "/whats-new": "the member's menu at the sidebar's foot",
  // New's own row, which lights on it (`sidebar.tsx`).
  "/ask": "the New row",
};

// A dynamic segment gets a sample value.
const ALL = dashboardRoutes()
  .map((r) => r.replace(/\[[^\]]+\]/g, "sample-id"))
  .filter((r) => !NOT_A_TOOL_PAGE.has(r));

describe("every dashboard page has a way back and a place in the sidebar", () => {
  it("finds the routes", () => {
    expect(ALL.length).toBeGreaterThan(10);
  });

  it.each(ALL)("%s has a title, so its header draws a close", (route) => {
    expect(resolvePageTitle(route)).not.toBeNull();
  });

  it.each(ALL)("%s lights a sidebar row or is a listed door", (route) => {
    const lit = DASHBOARD_NAV_ITEMS.some(
      (item) => currentFor(item, route) !== undefined,
    );
    expect(lit || route in OFF_NAV_DOORS).toBe(true);
  });
});
