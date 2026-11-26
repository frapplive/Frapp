import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `useChannelJump` (#6053) wires four reads into `channel-jump.ts`'s rules.
 * The rules have their own spec; this one proves the wiring: which channels
 * it keeps, the counts and mutes it reads, and the category hints.
 */
const reads = vi.hoisted(() => ({
  channels: { data: undefined as unknown },
  unread: { data: undefined as unknown, isError: false },
  levels: { data: undefined as unknown, isError: false },
  categories: { data: undefined as unknown },
}));

vi.mock("./use-chat", () => ({
  useChannels: () => reads.channels,
  useChannelUnreadCounts: () => reads.unread,
  useChannelNotificationPreferences: () => reads.levels,
  useCategories: () => reads.categories,
}));

import { useChannelJump } from "./use-channel-jump";

const NO_RECENTS: string[] = [];

beforeEach(() => {
  reads.channels = {
    data: [
      { id: "general", name: "general", type: "PUBLIC" },
      { id: "rush", name: "rush", type: "PUBLIC", category_id: "cat-1" },
      { id: "quiet", name: "quiet", type: "PUBLIC" },
      { id: "dm", name: "dm-a-b", type: "DM" },
    ],
  };
  reads.unread = {
    data: [
      { channel_id: "rush", unread_count: 3, mention_count: 1 },
      { channel_id: "quiet", unread_count: 5, mention_count: 0 },
      { channel_id: "dm", unread_count: 2, mention_count: 0 },
    ],
    isError: false,
  };
  reads.levels = {
    data: [{ channel_id: "quiet", level: "off" }],
    isError: false,
  };
  reads.categories = { data: [{ id: "cat-1", name: "Recruitment" }] };
});

describe("useChannelJump", () => {
  it("lists the unread channels a member can jump to, leaving out DMs and a muted plain unread", () => {
    const { result } = renderHook(() => useChannelJump(NO_RECENTS));
    expect(result.current.channels.map((c) => c.id)).toEqual([
      "general",
      "rush",
      "quiet",
    ]);
    expect(result.current.unread.map((c) => c.id)).toEqual(["rush"]);
    expect(result.current.countsKnown).toBe(true);
    expect(result.current.countsFor("rush")).toEqual({
      unreadCount: 3,
      mentionCount: 1,
    });
    expect(result.current.looksUnread("rush")).toBe(true);
    expect(result.current.looksUnread("quiet")).toBe(false);
    expect(result.current.isMuted("quiet")).toBe(true);
  });

  it("names each channel's category, for its row and for a search's Channels group", () => {
    const { result } = renderHook(() => useChannelJump(NO_RECENTS));
    const rush = result.current.channels.find((c) => c.id === "rush")!;
    expect(result.current.categoryOf(rush)).toBe("Recruitment");
    expect(result.current.findChannels.map((c) => [c.id, c.category])).toEqual([
      ["general", undefined],
      ["rush", "Recruitment"],
      ["quiet", undefined],
    ]);
  });

  it("lists recently opened channels that aren't already listed unread", () => {
    const recents = ["rush", "quiet", "general"];
    const { result } = renderHook(() => useChannelJump(recents));
    expect(result.current.recent.map((c) => c.id)).toEqual([
      "quiet",
      "general",
    ]);
  });

  it("calls the counts unknown while they load or fail, so nothing reads unread", () => {
    reads.unread = { data: undefined, isError: false };
    const loading = renderHook(() => useChannelJump(NO_RECENTS));
    expect(loading.result.current.countsKnown).toBe(false);
    expect(loading.result.current.unread).toEqual([]);

    reads.unread = { data: [], isError: true };
    const failed = renderHook(() => useChannelJump(NO_RECENTS));
    expect(failed.result.current.countsKnown).toBe(false);
  });
});
