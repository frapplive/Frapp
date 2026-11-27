import { Alert } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({
  pathname: undefined as string | undefined,
  threadRootId: undefined as string | undefined,
}));
// The real rule over the stand-in route: a thread is never replaceable.
vi.mock("@/lib/current-pathname", () => ({
  currentReplaceablePathname: () =>
    route.threadRootId ? undefined : route.pathname,
}));
import {
  LINK_OPEN_FAILED_BODY,
  LINK_OPEN_FAILED_TITLE,
  openMessageLink,
} from "./open-link";

beforeEach(() => {
  vi.mocked(Alert.alert).mockClear();
  vi.mocked(Linking.openURL).mockClear();
  vi.mocked(WebBrowser.openBrowserAsync).mockClear();
});

describe("openMessageLink", () => {
  it("opens a web page in the in-app browser", async () => {
    await openMessageLink("https://frapp.live/a");
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      "https://frapp.live/a",
    );
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it("hands a mailto link to the OS", async () => {
    await openMessageLink("mailto:rush@frapp.live");
    expect(Linking.openURL).toHaveBeenCalledWith("mailto:rush@frapp.live");
  });

  it("refuses anything that is not an openable link", async () => {
    for (const href of [
      "javascript:alert(1)",
      "//attacker.example",
      "x.test",
    ]) {
      await openMessageLink(href);
    }
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it("says so when the link won't open, rather than doing nothing", async () => {
    vi.mocked(WebBrowser.openBrowserAsync).mockRejectedValueOnce(
      new Error("no browser"),
    );
    await openMessageLink("https://frapp.live/a");
    expect(Alert.alert).toHaveBeenCalledWith(
      LINK_OPEN_FAILED_TITLE,
      LINK_OPEN_FAILED_BODY,
    );
  });

  describe("dashboard links (#3723, #6050)", () => {
    const IN_APP = { dashboardLinksInApp: true } as const;
    const LINK = "https://app.frapp.live/chat?channel=c1&message=m1";
    beforeEach(() => {
      vi.mocked(router.push).mockClear();
      vi.mocked(router.replace).mockClear();
      delete process.env.EXPO_PUBLIC_APP_URL;
      route.pathname = undefined;
      route.threadRootId = undefined;
    });

    it("replaces an open channel rather than stacking a second", async () => {
      route.pathname = "/chat-thread";
      await openMessageLink(LINK, IN_APP);
      expect(router.replace).toHaveBeenCalledWith(
        "/chat-thread?channelId=c1&focusMessageId=m1",
      );
      expect(router.push).not.toHaveBeenCalled();
    });

    it("opens a message's link in the app from a message body", async () => {
      await openMessageLink(LINK, IN_APP);
      expect(router.push).toHaveBeenCalledWith(
        "/chat-thread?channelId=c1&focusMessageId=m1",
      );
      expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
    });

    it("opens the web's channel-only Copy link on the channel", async () => {
      await openMessageLink("https://app.frapp.live/chat?channel=c1", IN_APP);
      expect(router.push).toHaveBeenCalledWith("/chat-thread?channelId=c1");
    });

    it("opens an event link on the event, from the shared address table", async () => {
      await openMessageLink(
        "https://app.frapp.live/events?day=2026-11-30&event=e1",
        IN_APP,
      );
      expect(router.push).toHaveBeenCalledWith("/event-details?id=e1");
    });

    it("opens a thread link over its channel", async () => {
      await openMessageLink(
        "https://app.frapp.live/chat?channel=c1&thread=t1",
        IN_APP,
      );
      expect(router.push).toHaveBeenNthCalledWith(
        1,
        "/chat-thread?channelId=c1",
      );
      expect(router.push).toHaveBeenNthCalledWith(
        2,
        "/chat-thread?channelId=c1&threadRootId=t1",
      );
    });

    it("pushes over a thread a link is tapped in, never replacing it", async () => {
      route.pathname = "/chat-thread";
      route.threadRootId = "t0";
      await openMessageLink(LINK, IN_APP);
      expect(router.replace).not.toHaveBeenCalled();
      expect(router.push).toHaveBeenCalledWith(
        "/chat-thread?channelId=c1&focusMessageId=m1",
      );
    });

    it("keeps the browser for an address the phone would open without its record", async () => {
      for (const link of [
        "https://app.frapp.live/documents?document=d1",
        "https://app.frapp.live/members?tab=alumni",
        "https://app.frapp.live/chat?message=m1",
      ]) {
        await openMessageLink(link, IN_APP);
        expect(WebBrowser.openBrowserAsync).toHaveBeenLastCalledWith(link);
      }
      expect(router.push).not.toHaveBeenCalled();
    });

    it("keeps the browser for a web-only page", async () => {
      await openMessageLink("https://app.frapp.live/backwork", IN_APP);
      expect(router.push).not.toHaveBeenCalled();
      expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
        "https://app.frapp.live/backwork",
      );
    });

    it("keeps the browser for a caller that didn't ask, like a proof-link chip in a sheet", async () => {
      await openMessageLink(LINK);
      expect(router.push).not.toHaveBeenCalled();
      expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(LINK);
    });

    it("opens only its own build's origin in the app: a staging build sends production links to the web", async () => {
      process.env.EXPO_PUBLIC_APP_URL = "https://staging.frapp.live";
      await openMessageLink(LINK, IN_APP);
      expect(router.push).not.toHaveBeenCalled();
      expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(LINK);
      await openMessageLink(
        "https://staging.frapp.live/chat?channel=c1&message=m1",
        IN_APP,
      );
      expect(router.push).toHaveBeenCalledWith(
        "/chat-thread?channelId=c1&focusMessageId=m1",
      );
      delete process.env.EXPO_PUBLIC_APP_URL;
    });
  });
});
