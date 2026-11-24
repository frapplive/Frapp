import { describe, expect, it } from "vitest";
import { DASHBOARD_NAV_ITEMS } from "@/components/layout/nav-config";
import { isNavItemVisible } from "@/components/layout/protected-nav-item";
import { resolvePageTitle } from "@/components/layout/page-title";
import {
  COUNCIL_ONLY_ROUTES,
  COUNCIL_ROUTES,
  isCouncilOnlyRoute,
  isCouncilRoute,
} from "@/components/layout/council-route-gate";

const ALL = ["*"];
const everyModuleOn = () => true;

function visibleIds(kind: "chapter" | "council" | undefined): string[] {
  return DASHBOARD_NAV_ITEMS.filter((item) =>
    isNavItemVisible(item, ALL, everyModuleOn, undefined, kind),
  ).map((item) => item.id);
}

/**
 * A council's shell (#5933): only what its routes serve. Every other
 * chapter route answers a council 403 `chapter.context.invalid`.
 */
describe("the nav in a council", () => {
  it("keeps Chat, Direct messages, Chapters and Directory, and nothing else", () => {
    expect(visibleIds("council")).toEqual([
      "chat",
      "direct",
      "chapters",
      "members",
    ]);
  });

  it("leaves a chapter's nav without Chapters, and gates no chapter row while the kind is unknown", () => {
    const chapterRows = DASHBOARD_NAV_ITEMS.map((item) => item.id).filter(
      (id) => id !== "chapters",
    );
    expect(visibleIds("chapter")).toEqual(chapterRows);
    // A council-only row waits for the kind (#5974), so it never costs a
    // chapter's nav its 36px or flashes in and out.
    expect(visibleIds(undefined)).toEqual(chapterRows);
  });

  it("shows Chapters to every council member who reads members (#5974)", () => {
    const chapters = DASHBOARD_NAV_ITEMS.find(
      (item) => item.id === "chapters",
    )!;
    expect(
      isNavItemVisible(
        chapters,
        ["members:view"],
        everyModuleOn,
        undefined,
        "council",
      ),
    ).toBe(true);
    expect(
      isNavItemVisible(
        chapters,
        ["council:chapters_manage"],
        everyModuleOn,
        undefined,
        "council",
      ),
    ).toBe(false);
    expect(
      isNavItemVisible(
        chapters,
        undefined,
        everyModuleOn,
        undefined,
        "council",
      ),
    ).toBe(false);
  });

  it("only ever links a council to a route its space serves", () => {
    for (const item of DASHBOARD_NAV_ITEMS) {
      if (item.kinds?.includes("council")) {
        expect(isCouncilRoute(item.href.split("?")[0]!), item.id).toBe(true);
      }
    }
  });
});

describe("isCouncilRoute", () => {
  it("serves chat, the Directory and settings, and sends the rest away", () => {
    for (const route of COUNCIL_ROUTES) {
      expect(isCouncilRoute(route), route).toBe(true);
      expect(isCouncilRoute(`${route}/x`), route).toBe(true);
    }
    for (const route of ["/events", "/activity", "/tasks", "/points", "/ask"]) {
      expect(isCouncilRoute(route), route).toBe(false);
    }
    expect(isCouncilRoute("/chatter")).toBe(false);
  });

  it("keeps a chapter out of a council's Chapters page (#5974)", () => {
    for (const route of COUNCIL_ONLY_ROUTES) {
      expect(isCouncilRoute(route), route).toBe(true);
      expect(isCouncilOnlyRoute(route), route).toBe(true);
      expect(isCouncilOnlyRoute(`${route}/x`), route).toBe(true);
    }
    expect(isCouncilOnlyRoute("/chaptersx")).toBe(false);
    expect(isCouncilOnlyRoute("/members")).toBe(false);
    expect(isCouncilOnlyRoute(null)).toBe(false);
    // The chapter's own School and council page is no council's.
    expect(isCouncilRoute("/affiliations")).toBe(false);
  });
});

describe("Settings' title by tenant kind", () => {
  it("reads Council settings in a council and Chapter settings otherwise", () => {
    expect(resolvePageTitle("/settings", undefined, "council")).toEqual({
      title: "Council settings",
    });
    expect(resolvePageTitle("/settings", undefined, "chapter")).toEqual({
      title: "Chapter settings",
    });
    expect(resolvePageTitle("/settings")).toEqual({
      title: "Chapter settings",
    });
  });
});
