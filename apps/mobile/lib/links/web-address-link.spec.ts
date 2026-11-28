import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WEB_ADDRESSES } from "@repo/validation";
import { redirectSystemPath } from "../../app/+native-intent";
import { systemPathForWebLink, webLinkTarget } from "./web-address-link";

const ORIGIN = "https://app.frapp.live";
const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(here, "..", "..", "app");

/** Whether an expo-router pathname has a route file under `app/`. */
function routeExists(pathname: string): boolean {
  const name = pathname === "/" ? "index" : pathname.slice(1);
  return [
    path.join(appDir, "(app)", `${name}.tsx`),
    path.join(appDir, "(app)", "(tabs)", `${name}.tsx`),
  ].some((file) => existsSync(file));
}

describe("a web address opens its phone screen (#6050)", () => {
  it("names a route file that exists for every phone screen in the table", () => {
    for (const row of WEB_ADDRESSES) {
      for (const screen of row.phone ?? []) {
        expect(
          routeExists(screen.pathname),
          `${row.path} → ${screen.pathname}`,
        ).toBe(true);
      }
    }
  });

  it("resolves every row the phone has, through the system's handler, to that row's screen", () => {
    for (const row of WEB_ADDRESSES) {
      if (!row.phone || row.path.includes("[")) continue;
      for (const screen of row.phone) {
        // Every parameter the screen reads, so each mapping is exercised.
        const names = new Set([
          ...(screen.when ?? []),
          ...Object.keys(screen.params ?? {}),
        ]);
        const query = new URLSearchParams([...names].map((n) => [n, "x1"]));
        const search = query.toString();
        const link = `${ORIGIN}${row.path}${search ? `?${search}` : ""}`;
        const target = webLinkTarget(link, [ORIGIN]);
        expect(target, link).not.toBeNull();
        expect(target!.pathname, link).toBe(screen.pathname);
        for (const phoneName of Object.values(screen.params ?? {})) {
          expect(target!.params?.[phoneName], `${link} → ${phoneName}`).toBe(
            "x1",
          );
        }
        const out = redirectSystemPath({ path: link, initial: true });
        expect(routeExists(out.split("?")[0]!), `${link} → ${out}`).toBe(true);
      }
    }
  });

  it("opens the views the phone reads: Minutes, and a time-extension request", () => {
    expect(
      systemPathForWebLink(`${ORIGIN}/documents?type=minutes`, [ORIGIN]),
    ).toBe("/documents?type=minutes");
    expect(
      systemPathForWebLink(`${ORIGIN}/activity?extension=t1`, [ORIGIN]),
    ).toBe("/activity?extension=t1");
  });

  it("leaves an address in the browser when the phone would drop what it points at", () => {
    for (const link of [
      `${ORIGIN}/documents?document=d1`,
      `${ORIGIN}/documents?folder=Finance`,
      `${ORIGIN}/members?tab=alumni`,
      `${ORIGIN}/activity?posting=p1`,
      `${ORIGIN}/chat?message=m1`,
    ]) {
      expect(webLinkTarget(link, [ORIGIN]), link).toBeNull();
    }
    // A less specific screen's parameter is context, not a record.
    expect(
      systemPathForWebLink(`${ORIGIN}/events?day=2026-11-30&event=e1`, [ORIGIN]),
    ).toBe("/event-details?id=e1");
  });

  it("opens a role, a tier and bare Chapter settings, and leaves its other pages in the browser (#6049)", () => {
    expect(
      systemPathForWebLink(`${ORIGIN}/settings?tab=roles&role=r1`, [ORIGIN]),
    ).toBe("/role?roleId=r1");
    expect(
      systemPathForWebLink(`${ORIGIN}/settings?tab=roles&tier=t1`, [ORIGIN]),
    ).toBe("/role-tier?tierId=t1");
    expect(systemPathForWebLink(`${ORIGIN}/settings`, [ORIGIN])).toBe(
      "/chapter-settings",
    );
    for (const link of [
      `${ORIGIN}/settings?tab=chat&page=chat-admin&channel=c1`,
      `${ORIGIN}/settings?tab=roles&group=g1`,
      `${ORIGIN}/settings?tab=geofences&page=study-zones&zone=z1`,
    ]) {
      expect(webLinkTarget(link, [ORIGIN]), link).toBeNull();
    }
  });

  it("trims ids, and treats an empty one as absent", () => {
    expect(
      systemPathForWebLink(`${ORIGIN}/chat?channel=%20c1%20`, [ORIGIN]),
    ).toBe("/chat-thread?channelId=c1");
    expect(webLinkTarget(`${ORIGIN}/chat?channel=%20`, [ORIGIN])).toEqual({
      pathname: "/",
    });
  });

  it("opens the most specific screen, with the phone's parameter names", () => {
    expect(
      systemPathForWebLink(`${ORIGIN}/events?day=2026-11-30&event=e1`, [
        ORIGIN,
      ]),
    ).toBe("/event-details?id=e1");
    expect(systemPathForWebLink(`${ORIGIN}/members?member=u1`, [ORIGIN])).toBe(
      "/member?userId=u1",
    );
    expect(systemPathForWebLink(`${ORIGIN}/documents`, [ORIGIN])).toBe(
      "/documents",
    );
  });

  it("opens a thread link on its channel at the thread's first message, from the system", () => {
    expect(
      systemPathForWebLink(`${ORIGIN}/chat?channel=c1&thread=t1`, [ORIGIN]),
    ).toBe("/chat-thread?channelId=c1&focusMessageId=t1");
    expect(
      webLinkTarget(`${ORIGIN}/chat?channel=c1&thread=t1`, [ORIGIN]),
    ).toEqual({
      pathname: "/chat-thread",
      params: { channelId: "c1", threadRootId: "t1" },
      under: { pathname: "/chat-thread", params: { channelId: "c1" } },
    });
  });

  it("passes through what isn't a dashboard address the phone has a screen for", () => {
    for (const link of [
      `${ORIGIN}/join?t=abc`,
      `${ORIGIN}/check-in?event=e1&t=x`,
      `${ORIGIN}/backwork`,
      `${ORIGIN}/settings?tab=roles`,
      "https://example.com/events?event=e1",
      "frapp://event-details?id=e1",
      "/event-details?id=e1",
      "not a url",
    ]) {
      expect(redirectSystemPath({ path: link, initial: false }), link).toBe(
        link,
      );
    }
  });
});
