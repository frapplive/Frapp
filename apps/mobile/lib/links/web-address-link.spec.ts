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

  it("resolves every row the phone has, through the system's handler, to an existing route", () => {
    for (const row of WEB_ADDRESSES) {
      if (!row.phone || row.path.includes("[")) continue;
      for (const screen of row.phone) {
        const query = new URLSearchParams(
          (screen.when ?? []).map((name) => [name, "x1"]),
        );
        const search = query.toString();
        const link = `${ORIGIN}${row.path}${search ? `?${search}` : ""}`;
        const out = redirectSystemPath({ path: link, initial: true });
        const pathname = out.split("?")[0]!;
        expect(out, link).not.toBe(link);
        expect(routeExists(pathname), `${link} → ${out}`).toBe(true);
      }
    }
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
    // A page's list screen for an address it has no screen for.
    expect(
      systemPathForWebLink(`${ORIGIN}/documents?folder=Finance`, [ORIGIN]),
    ).toBe("/documents");
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
