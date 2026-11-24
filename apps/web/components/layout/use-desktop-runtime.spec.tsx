// @vitest-environment jsdom
import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  notifications: undefined as unknown,
  unread: [] as unknown,
  channels: [] as unknown,
  chapterId: "ch-1",
  push: vi.fn(),
  markRead: vi.fn(),
  markManyRead: vi.fn(),
  invalidateLists: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useActiveChapterId: () => state.chapterId,
  invalidateNotificationLists: state.invalidateLists,
  useMarkNotificationsRead: () => ({ mutate: state.markManyRead }),
  useNotifications: () => ({ data: state.notifications }),
  useChannelUnreadCounts: () => ({ data: state.unread }),
  useChannels: () => ({ data: state.channels }),
  useMarkNotificationRead: () => ({ mutate: state.markRead }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidateQueries }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push }),
}));
vi.mock("@/components/layout/notifications-popover", () => ({
  deepLinkFor: (row: { id: string }) => `/opened/${row.id}`,
}));

import { DesktopRuntime } from "./desktop-runtime";
import { DESKTOP_REFRESH_MS, useDesktopRuntime } from "./use-desktop-runtime";

const shown: FakeNotification[] = [];
class FakeNotification {
  onclick: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  close(): void {
    this.closed = true;
  }
  constructor(
    readonly title: string,
    readonly options: NotificationOptions,
  ) {
    shown.push(this);
  }
}

const bridge = { openExternal: vi.fn(), setBadgeCount: vi.fn(), showWindow: vi.fn() };
// Server times, deliberately nowhere near this machine's clock.
const at = (minute: number) => `2031-03-01T10:${String(minute).padStart(2, "0")}:00Z`;
const chatRow = (id: string, channelId = "c-1", minute = 5) => ({
  id,
  chapter_id: "ch-1",
  title: "Ryan in #general",
  body: "tonight?",
  read_at: null,
  created_at: at(minute),
  data: { target: { screen: "chat", channelId } },
});

beforeEach(() => {
  (window as { frappDesktop?: unknown }).frappDesktop = bridge;
  vi.stubGlobal("Notification", FakeNotification);
  state.notifications = undefined;
  state.unread = [];
  state.channels = [];
  state.chapterId = "ch-1";
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

  it("a click reads every unread row of the conversation in one request (#3948)", () => {
    state.notifications = [chatRow("n-1", "c-1", 1)];
    const { rerender } = renderHook(() => useDesktopRuntime());
    state.notifications = [chatRow("n-1", "c-1", 1), chatRow("n-2", "c-1", 6)];
    rerender();

    shown[0]!.onclick?.();
    expect(state.markManyRead).toHaveBeenCalledWith({ ids: ["n-1", "n-2"] });
    expect(state.markRead).not.toHaveBeenCalled();
    expect(state.push).toHaveBeenCalledWith("/opened/n-2");
  });

  it("judges news by the server's times, not this computer's clock", () => {
    // Every row here is years from `Date.now()`; only their order matters.
    state.notifications = [chatRow("n-1", "c-1", 5)];
    const { rerender } = renderHook(() => useDesktopRuntime());
    // An older row scrolling into the page is not news; a newer one is.
    state.notifications = [chatRow("n-1", "c-1", 5), chatRow("n-0", "c-0", 2), chatRow("n-2", "c-2", 7)];
    rerender();
    expect(shown.map((n) => n.options.tag)).toEqual(["chat:c-2"]);
  });

  it("makes no sound for a row its sender marked low priority", () => {
    state.notifications = [];
    const { rerender } = renderHook(() => useDesktopRuntime());
    state.notifications = [
      { ...chatRow("n-1"), data: { target: { screen: "events" }, priority: "SILENT" } },
    ];
    rerender();
    expect(shown[0]?.options.silent).toBe(true);
  });

  it("starts over in another chapter: its waiting rows raise nothing, and the last chapter's notifications come down", () => {
    state.notifications = [];
    const { rerender } = renderHook(() => useDesktopRuntime());
    state.notifications = [chatRow("n-1")];
    rerender();
    expect(shown).toHaveLength(1);

    state.chapterId = "ch-2";
    state.notifications = [{ ...chatRow("m-1", "c-9", 9), chapter_id: "ch-2" }];
    rerender();
    expect(shown).toHaveLength(1);
    expect(shown[0]!.closed).toBe(true);

    state.notifications = [
      { ...chatRow("m-1", "c-9", 9), chapter_id: "ch-2" },
      { ...chatRow("m-2", "c-8", 10), chapter_id: "ch-2" },
    ];
    rerender();
    expect(shown.map((n) => n.options.tag)).toEqual(["chat:c-1", "chat:c-8"]);
  });

  it("a click on a row from another chapter only brings the window forward", () => {
    state.notifications = [];
    const { rerender } = renderHook(() => useDesktopRuntime());
    state.notifications = [{ ...chatRow("n-1"), chapter_id: "ch-other" }];
    rerender();

    shown[0]!.onclick?.();
    expect(bridge.showWindow).toHaveBeenCalled();
    expect(state.markRead).not.toHaveBeenCalled();
    expect(state.push).not.toHaveBeenCalled();
  });

  it("clears the icon and takes its notifications down when the dashboard closes", () => {
    state.notifications = [];
    const { rerender, unmount } = renderHook(() => useDesktopRuntime());
    state.notifications = [chatRow("n-1")];
    rerender();
    bridge.setBadgeCount.mockClear();

    unmount();
    expect(bridge.setBadgeCount).toHaveBeenLastCalledWith(0);
    expect(shown[0]!.closed).toBe(true);
  });

  it("reads the list and the counts again every minute, whatever realtime says", () => {
    vi.useFakeTimers();
    try {
      const { unmount } = renderHook(() => useDesktopRuntime());
      expect(state.invalidateLists).not.toHaveBeenCalled();
      vi.advanceTimersByTime(DESKTOP_REFRESH_MS);
      expect(state.invalidateLists).toHaveBeenCalledTimes(1);
      expect(state.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["channels", "unread"] });
      unmount();
      vi.advanceTimersByTime(DESKTOP_REFRESH_MS);
      expect(state.invalidateLists).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("DesktopRuntime", () => {
  it("runs inside the desktop app", () => {
    state.notifications = [{ ...chatRow("n-2"), data: { target: { screen: "events" } } }];
    render(<DesktopRuntime />);
    expect(bridge.setBadgeCount).toHaveBeenLastCalledWith(1);
  });

  it("does nothing in a browser", () => {
    delete (window as { frappDesktop?: unknown }).frappDesktop;
    state.notifications = [];
    const { rerender } = render(<DesktopRuntime />);
    state.notifications = [chatRow("n-1")];
    rerender(<DesktopRuntime />);
    expect(shown).toHaveLength(0);
    expect(bridge.setBadgeCount).not.toHaveBeenCalled();
    expect(state.invalidateLists).not.toHaveBeenCalled();
  });
});
