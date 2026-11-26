import { describe, expect, it } from "vitest";
import {
  JUMP_MORE_FROM_LETTERS,
  JUMP_RECENT_LIMIT,
  JUMP_UNREAD_LIMIT,
  RECENT_CHANNELS_CAP,
  channelJumpLists,
  channelsThatLookUnread,
  jumpMentionLabel,
  jumpableChannels,
  parseRecentChannels,
  rankChannelMatches,
  recentChannelsStorageKey,
  withRecentChannel,
  type JumpChannel,
} from "./channel-jump";
import type { SidebarUnreadCounts } from "./channel-sidebar";

const ch = (id: string, name = id, type = "PUBLIC"): JumpChannel => ({
  id,
  name,
  type,
});

const counts = (
  entries: Record<string, [number, number]>,
): Map<string, SidebarUnreadCounts> =>
  new Map(
    Object.entries(entries).map(([id, [unreadCount, mentionCount]]) => [
      id,
      { unreadCount, mentionCount },
    ]),
  );

describe("jumpableChannels (#6053)", () => {
  it("leaves out direct messages and hidden rows", () => {
    expect(
      jumpableChannels([
        ch("general"),
        ch("dm", "dm-a-b", "DM"),
        ch("group", "Exec board", "GROUP_DM"),
        { ...ch("old"), hidden: true },
      ]).map((c) => c.id),
    ).toEqual(["general"]);
  });
});

describe("rankChannelMatches (#6053)", () => {
  const list = [
    ch("rush-general"),
    ch("events"),
    ch("rush-events"),
    ch("brunch"),
    ch("rush"),
  ];

  it("puts a name that starts with the letters first, the shortest leading", () => {
    expect(rankChannelMatches(list, "ru").map((c) => c.id)).toEqual([
      "rush",
      "rush-events",
      "rush-general",
      "brunch",
    ]);
  });

  it("ranks a word inside the name above a match mid-word", () => {
    expect(rankChannelMatches(list, "ev").map((c) => c.id)).toEqual([
      "events",
      "rush-events",
    ]);
  });

  it("ignores case and a leading #", () => {
    expect(rankChannelMatches(list, "#RUSH-E").map((c) => c.id)).toEqual([
      "rush-events",
    ]);
  });

  it("matches nothing for nothing typed, and caps at the limit", () => {
    expect(rankChannelMatches(list, "  ")).toEqual([]);
    expect(rankChannelMatches(list, "r", 2)).toHaveLength(2);
  });
});

describe("channelJumpLists (#6053)", () => {
  const channels = [ch("a"), ch("b"), ch("c"), ch("d"), ch("e")];

  it("lists unread channels, mentions first, then in the chapter's order", () => {
    const { unread } = channelJumpLists({
      channels,
      unreadByChannelId: counts({ a: [2, 0], c: [1, 1], d: [3, 0] }),
      mutedChannelIds: new Set(),
      recentIds: [],
    });
    expect(unread.map((c) => c.id)).toEqual(["c", "a", "d"]);
  });

  it("leaves out a muted channel's plain unread, but not its mention", () => {
    const { unread } = channelJumpLists({
      channels,
      unreadByChannelId: counts({ a: [2, 0], b: [1, 1] }),
      mutedChannelIds: new Set(["a", "b"]),
      recentIds: [],
    });
    expect(unread.map((c) => c.id)).toEqual(["b"]);
  });

  it("calls nothing unread while the counts are unknown", () => {
    expect(
      channelJumpLists({
        channels,
        unreadByChannelId: undefined,
        mutedChannelIds: undefined,
        recentIds: ["a"],
      }),
    ).toEqual({ unread: [], recent: [channels[0]] });
  });

  it("lists recently opened newest first, never a channel twice or one gone", () => {
    const { recent } = channelJumpLists({
      channels,
      unreadByChannelId: counts({ b: [1, 0] }),
      mutedChannelIds: new Set(),
      recentIds: ["b", "gone", "d", "a"],
    });
    expect(recent.map((c) => c.id)).toEqual(["d", "a"]);
  });

  it("caps each group: ten unread and five recent unless told otherwise", () => {
    expect(JUMP_UNREAD_LIMIT).toBe(10);
    expect(JUMP_RECENT_LIMIT).toBe(5);
    const many = Array.from({ length: 8 }, (_, i) => ch(`c${i}`));
    const lists = channelJumpLists({
      channels: many,
      unreadByChannelId: counts(
        Object.fromEntries(many.map((c) => [c.id, [1, 0]])),
      ),
      mutedChannelIds: new Set(),
      recentIds: many.map((c) => c.id),
      unreadLimit: 3,
      recentLimit: 2,
    });
    expect(lists.unread).toHaveLength(3);
    // The rest are unread but past the cap, so they may show as recent.
    expect(lists.recent.map((c) => c.id)).toEqual(["c3", "c4"]);
  });
});

describe("channelsThatLookUnread", () => {
  it("is the rows' own rule: a mention gets past a mute", () => {
    expect(
      channelsThatLookUnread(
        [ch("a"), ch("b")],
        counts({ a: [4, 0], b: [1, 1] }),
        new Set(["a", "b"]),
      ),
    ).toEqual(new Set(["b"]));
  });
});

describe("jumpMentionLabel", () => {
  it("counts only what addresses the member, up to 99+", () => {
    expect(jumpMentionLabel({ unreadCount: 12, mentionCount: 0 })).toBeNull();
    expect(jumpMentionLabel(undefined)).toBeNull();
    expect(jumpMentionLabel({ unreadCount: 3, mentionCount: 2 })).toBe("@ 2");
    expect(jumpMentionLabel({ unreadCount: 300, mentionCount: 120 })).toBe(
      "@ 99+",
    );
  });
});

describe("recently opened on the device", () => {
  it("keys per member and chapter", () => {
    expect(recentChannelsStorageKey("u1", "ch1")).toBe(
      "frapp.chat.recent-channels.u1.ch1",
    );
  });

  it("puts the channel opened just now first, once, and caps the list", () => {
    expect(withRecentChannel(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    const full = Array.from({ length: RECENT_CHANNELS_CAP }, (_, i) => `c${i}`);
    const next = withRecentChannel(full, "new");
    expect(next).toHaveLength(RECENT_CHANNELS_CAP);
    expect(next[0]).toBe("new");
  });

  it("reads a missing or broken store as empty", () => {
    expect(parseRecentChannels(null)).toEqual([]);
    expect(parseRecentChannels("not json")).toEqual([]);
    expect(parseRecentChannels('{"a":1}')).toEqual([]);
    expect(parseRecentChannels('["a", 2, "b"]')).toEqual(["a", "b"]);
  });
});

describe("copy", () => {
  it("names the letters a search needs", () => {
    expect(JUMP_MORE_FROM_LETTERS(3)).toBe(
      "Messages, events and more from 3 letters.",
    );
  });
});
