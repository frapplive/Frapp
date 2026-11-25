import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePageTitle } from "./page-title";
import { DASHBOARD_NAV_ITEMS } from "./nav-config";

describe("resolvePageTitle", () => {
  it("titles every nav row with the row's own label, and no parent", () => {
    for (const item of DASHBOARD_NAV_ITEMS) {
      expect(resolvePageTitle(item.href)).toEqual({ title: item.label });
    }
  });

  it("titles the two chat pages (#5946)", () => {
    expect(resolvePageTitle("/chat")).toEqual({ title: "Chat" });
    expect(resolvePageTitle("/messages")).toEqual({ title: "Messages" });
  });

  it("titles no officer tool apart from Chapter settings (#3837)", () => {
    // The tools open inside Chapter settings, whose rail names them; their
    // old routes only redirect there and name nothing.
    for (const route of [
      "/chat-admin",
      "/discord-import",
      "/reports",
      "/geofences",
    ]) {
      expect(resolvePageTitle(route), route).toBeNull();
    }
  });

  it("titles a route's sub-paths as the route, but not a lookalike prefix", () => {
    expect(resolvePageTitle("/events/abc")).toEqual({ title: "Calendar" });
    expect(resolvePageTitle("/eventsx")).toBeNull();
  });

  // #5949: Documents and Backwork are views of one Resources page.
  it("titles Documents and Backwork as Resources, the one row they share", () => {
    expect(resolvePageTitle("/documents")).toEqual({ title: "Resources" });
    expect(resolvePageTitle("/backwork")).toEqual({ title: "Resources" });
  });

  it("puts Bulk upload under Resources, going back to Backwork", () => {
    expect(resolvePageTitle("/backwork/upload")).toEqual({
      title: "Bulk upload",
      parent: { label: "Resources", href: "/backwork" },
    });
    expect(
      resolvePageTitle("/backwork/upload", (item) => item.id !== "resources"),
    ).toEqual({
      title: "Bulk upload",
    });
    // The crumb asks whether the viewer can open Backwork, the view it goes
    // back to, not only the row: the row with Documents alone is no door.
    const asked: string[][] = [];
    resolvePageTitle("/backwork/upload", (item) => {
      asked.push((item.views ?? []).map((view) => view.href));
      return true;
    });
    expect(asked).toEqual([["/backwork"]]);
  });

  it("titles Profile, which is not a nav row", () => {
    expect(resolvePageTitle("/profile")).toEqual({ title: "Profile" });
  });

  it("keeps the two doors' titles apart (#3856)", () => {
    // The member's own page is "Settings"; the chapter menu's is the chapter's.
    expect(resolvePageTitle("/preferences")).toEqual({ title: "Settings" });
    expect(resolvePageTitle("/settings")).toEqual({
      title: "Chapter settings",
    });
  });

  it("titles one meeting's minutes under Resources, going back to the chapter's minutes (#5949)", () => {
    expect(resolvePageTitle("/meetings/0b9d1c1e")).toEqual({
      title: "Minutes",
      parent: { label: "Resources", href: "/documents?type=minutes" },
    });
  });

  it("invents nothing for a route it does not know", () => {
    expect(resolvePageTitle("/somewhere-new")).toBeNull();
    expect(resolvePageTitle(null)).toBeNull();
  });

  it("matches each route's browser-tab title, so the tab and the heading agree", () => {
    // Each route also names itself in `metadata.title`. Read as text, because
    // importing every page would pull the whole app into this test.
    const dashboard = join(__dirname, "../../app/(dashboard)");
    let checked = 0;
    for (const dir of readdirSync(dashboard)) {
      const page = join(dashboard, dir, "page.tsx");
      if (!existsSync(page)) continue;
      const match = /metadata\s*=\s*\{[^}]*title:\s*"([^"]+)"/.exec(
        readFileSync(page, "utf8"),
      );
      if (!match) continue; // a redirect-only route names nothing
      expect(resolvePageTitle(`/${dir}`)?.title, `/${dir}`).toBe(match[1]);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(10);
  });
});

describe("a row named in the chapter's own word (#5924)", () => {
  it("titles the recruitment page Rush, Recruitment or Intake as the chapter says it", () => {
    expect(resolvePageTitle("/rush")).toEqual({ title: "Rush" });
    expect(
      resolvePageTitle("/rush", undefined, {
        vocabulary: { recruitment: "Intake" },
      }),
    ).toEqual({ title: "Intake" });
  });
});
