import { describe, expect, it } from "vitest";
import { DASHBOARD_NAV_ITEMS } from "@/components/layout/nav-config";
import { isNavItemVisible } from "@/components/layout/protected-nav-item";
import { resolvePageTitle } from "@/components/layout/page-title";
import {
  COUNCIL_ROUTES,
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
  it("keeps Chat, Direct messages and Directory, and nothing else", () => {
    expect(visibleIds("council")).toEqual(["chat", "direct", "members"]);
  });

  it("leaves a chapter's nav as it was, and gates nothing while the kind is unknown", () => {
    const every = DASHBOARD_NAV_ITEMS.map((item) => item.id);
    expect(visibleIds("chapter")).toEqual(every);
    expect(visibleIds(undefined)).toEqual(every);
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
});

describe("Settings' title by tenant kind", () => {
  it("reads Council settings in a council and Chapter settings otherwise", () => {
    expect(resolvePageTitle("/settings", undefined, undefined, "council")).toEqual({
      title: "Council settings",
    });
    expect(resolvePageTitle("/settings", undefined, undefined, "chapter")).toEqual({
      title: "Chapter settings",
    });
    expect(resolvePageTitle("/settings")).toEqual({
      title: "Chapter settings",
    });
  });
});
