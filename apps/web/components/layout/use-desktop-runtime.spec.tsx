// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  notifications: undefined as unknown,
  unread: [] as unknown,
  channels: [] as unknown,
  search: "",
  push: vi.fn(),
  markRead: vi.fn(),
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useActiveChapterId: () => "ch-1",
  useNotifications: () => ({ data: state.notifications }),
  useChannelUnreadCounts: () => ({ data: state.unread }),
  useChannels: () => ({ data: state.channels }),
  useMarkNotificationRead: () => ({ mutate: state.markRead }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push }),
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("@/components/layout/notifications-popover", () => ({
  deepLinkFor: (row: { id: string }) => `/opened/${row.id}`,
}));

import { useDesktopRuntime } from "./use-desktop-runtime";

type Shown = { title: string; options: NotificationOptions; onclick: (() => void) | null };
const shown: Shown[] = [];
class FakeNotification {
  onclick: (() => void) | null = null;
  constructor(
    readonly title: string,
    readonly options: NotificationOptions,
  ) {
    shown.push(this);
  }
}

const bridge = { openExternal: vi.fn(), setBadgeCount: vi.fn(), showWindow: vi.fn() };
const soon = () => new Date(Date.now() + 60_000).toISOString();
const chatRow = (id: string, channelId = "c-1") => ({
  id,
  title: "Ryan in #general",
  body: "tonight?",
  read_at: null,
  created_at: soon(),
  data: { target: { screen: "chat", channelId } },
});

beforeEach(() => {
  (window as { frappDesktop?: unknown }).frappDesktop = bridge;
  vi.stubGlobal("Notification", FakeNotification);
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  state.notifications = undefined;
  state.unread = [];
  state.channels = [];
  state.search = "";
});

afterEach(() => {
  cleanup();
  delete (window as { frappDesktop?: unknown }).frappDesktop;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  shown.length = 0;
});

describe("useDesktopRuntime", () => {
  it("puts what addresses the member on the icon: other notices, mentions and direct messages", () => {
    state.notifications = [
      { ...chatRow("n-1") },
      { ...chatRow("n-2"), data: { target: { screen: "events" } } },
    ];
    state.channels = [
      { id: "c-1", type: "PUBLIC" },
      { id: "dm-1", type: "DM" },
    ];
    state.unread = [
      { channel_id: "c-1", unread_count: 9, mention_count: 2 },
      { channel_id: "dm-1", unread_count: 3, mention_count: 0 },
    ];
    renderHook(() => useDesktopRuntime());
    expect(bridge.setBadgeCount).toHaveBeenLastCalledWith(1 + 2 + 3);
  });

  it("raises nothing for what was already waiting when the app opened", () => {
    state.notifications = [chatRow("n-1")];
    renderHook(() => useDesktopRuntime());
    expect(shown).toHaveLength(0);
  });

  it("raises a new row, and a click brings the window forward, reads it and opens it", () => {
    state.notifications = [];
    const { rerender } = renderHook(() => useDesktopRuntime());
    state.notifications = [chatRow("n-1")];
    rerender();

    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ title: "Ryan in #general", options: { body: "tonight?", tag: "chat:c-1" } });

    shown[0]!.onclick?.();
    expect(bridge.showWindow).toHaveBeenCalled();
    expect(state.markRead).toHaveBeenCalledWith("n-1");
    expect(state.push).toHaveBeenCalledWith("/opened/n-1");

    // The same list read again raises nothing more.
    state.notifications = [chatRow("n-1")];
    rerender();
    expect(shown).toHaveLength(1);
  });

  it("stays quiet for the channel on screen while the window has focus, not once it loses it", () => {
    state.search = "channel=c-1";
    state.notifications = [];
    const { rerender } = renderHook(() => useDesktopRuntime());
    state.notifications = [chatRow("n-1")];
    rerender();
    expect(shown).toHaveLength(0);

    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    state.notifications = [chatRow("n-1"), chatRow("n-2")];
    rerender();
    expect(shown.map((n) => n.options.tag)).toEqual(["chat:c-1"]);
  });

  it("does nothing in a browser", () => {
    delete (window as { frappDesktop?: unknown }).frappDesktop;
    state.notifications = [];
    const { rerender } = renderHook(() => useDesktopRuntime());
    state.notifications = [chatRow("n-1")];
    rerender();
    expect(shown).toHaveLength(0);
    expect(bridge.setBadgeCount).not.toHaveBeenCalled();
  });
});
