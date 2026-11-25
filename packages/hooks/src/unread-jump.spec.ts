import { describe, expect, it } from "vitest";
import {
  arrangeChannelSidebar,
  type ArrangeSidebarInput,
  type SidebarUnreadCounts,
} from "./channel-sidebar";
import {
  NO_UNREAD_JUMP,
  sameUnreadJumpState,
  unreadJumpEdgeOf,
  unreadJumpLabel,
  unreadJumpState,
  unreadJumpTargets,
  type UnreadJumpEdge,
  type UnreadJumpTarget,
} from "./unread-jump";

interface Row {
  id: string;
  type: string;
}

const ch = (id: string, type = "PUBLIC"): Row => ({ id, type });

function arrange(
  sections: { key: "channels" | `category:${string}`; rows: Row[] }[],
  options: {
    unread?: Record<string, Partial<SidebarUnreadCounts>>;
    muted?: string[];
    collapsed?: string[];
    active?: string;
  } = {},
) {
  const unread = new Map(
    Object.entries(options.unread ?? {}).map(([id, c]) => [
      id,
      { unreadCount: c.unreadCount ?? 0, mentionCount: c.mentionCount ?? 0 },
    ]),
  );
  const muted = new Set(options.muted ?? []);
  const input: ArrangeSidebarInput<Row> = {
    sections: sections.map((s) => ({
      key: s.key,
      label: s.key,
      channels: s.rows,
    })),
    pinnedIds: new Set(),
    collapsed: new Set(options.collapsed ?? []),
    filters: { unreadOnly: false, hideMuted: false },
    activeChannelId: options.active ?? null,
    titleOf: (c) => c.id,
    unreadByChannelId: unread,
    mutedChannelIds: muted,
  };
  return {
    arranged: arrangeChannelSidebar(input),
    unread,
    muted,
  };
}

describe("unreadJumpTargets", () => {
  it("lists the rows that read unread, top to bottom, red when they address the member", () => {
    const { arranged, unread, muted } = arrange(
      [{ key: "channels", rows: [ch("a"), ch("b"), ch("c"), ch("d", "DM")] }],
      {
        unread: {
          a: { unreadCount: 3 },
          c: { unreadCount: 1, mentionCount: 1 },
          d: { unreadCount: 2 },
        },
      },
    );
    expect(
      unreadJumpTargets(arranged, {
        unreadByChannelId: unread,
        mutedChannelIds: muted,
        activeChannelId: null,
      }),
    ).toEqual([
      { key: "row:a", addressed: false },
      { key: "row:c", addressed: true },
      // Anything unread in a DM addresses the member.
      { key: "row:d", addressed: true },
    ]);
  });

  it("leaves out a muted channel's plain unread, but not its mention", () => {
    const { arranged, unread, muted } = arrange(
      [{ key: "channels", rows: [ch("quiet"), ch("pinged")] }],
      {
        unread: {
          quiet: { unreadCount: 9 },
          pinged: { unreadCount: 1, mentionCount: 1 },
        },
        muted: ["quiet", "pinged"],
      },
    );
    expect(
      unreadJumpTargets(arranged, {
        unreadByChannelId: unread,
        mutedChannelIds: muted,
        activeChannelId: null,
      }).map((t) => t.key),
    ).toEqual(["row:pinged"]);
  });

  it("stands a folded heading with an unread total in for its rows", () => {
    const { arranged, unread, muted } = arrange(
      [
        { key: "channels", rows: [ch("a")] },
        { key: "category:x", rows: [ch("b"), ch("c")] },
        { key: "category:y", rows: [ch("e")] },
      ],
      {
        unread: {
          b: { unreadCount: 1, mentionCount: 1 },
          e: { unreadCount: 4 },
        },
        muted: ["e"],
        collapsed: ["category:x", "category:y"],
      },
    );
    // y's only unread is muted, so its heading reads as read and isn't one.
    expect(
      unreadJumpTargets(arranged, {
        unreadByChannelId: unread,
        mutedChannelIds: muted,
        activeChannelId: null,
      }),
    ).toEqual([{ key: "head:category:x", addressed: true }]);
  });

  it("counts a channel whose listed thread has new replies, never the open channel", () => {
    const { arranged, unread, muted } = arrange(
      [{ key: "channels", rows: [ch("a"), ch("open"), ch("t")] }],
      { unread: { open: { unreadCount: 5 } } },
    );
    expect(
      unreadJumpTargets(arranged, {
        unreadByChannelId: unread,
        mutedChannelIds: muted,
        unreadThreadChannelIds: new Set(["t"]),
        activeChannelId: "open",
      }),
    ).toEqual([{ key: "row:t", addressed: false }]);
  });

  it("leaves the open channel's share out of a folded heading", () => {
    const sections = [
      { key: "category:x" as const, rows: [ch("open"), ch("b")] },
    ];
    const onlyOpen = arrange(sections, {
      unread: { open: { unreadCount: 2, mentionCount: 1 } },
      collapsed: ["category:x"],
      active: "open",
    });
    expect(
      unreadJumpTargets(onlyOpen.arranged, {
        unreadByChannelId: onlyOpen.unread,
        mutedChannelIds: onlyOpen.muted,
        activeChannelId: "open",
      }),
    ).toEqual([]);
    const withOther = arrange(sections, {
      unread: {
        open: { unreadCount: 2, mentionCount: 1 },
        b: { unreadCount: 1 },
      },
      collapsed: ["category:x"],
      active: "open",
    });
    // Neutral: the mention is the open channel's.
    expect(
      unreadJumpTargets(withOther.arranged, {
        unreadByChannelId: withOther.unread,
        mutedChannelIds: withOther.muted,
        activeChannelId: "open",
      }),
    ).toEqual([{ key: "head:category:x", addressed: false }]);
  });

  it("has none while the counts are unknown", () => {
    const { arranged } = arrange([{ key: "channels", rows: [ch("a")] }]);
    expect(
      unreadJumpTargets(arranged, {
        unreadByChannelId: undefined,
        mutedChannelIds: undefined,
        activeChannelId: null,
      }),
    ).toEqual([]);
  });
});

describe("unreadJumpEdgeOf", () => {
  const view = { top: 100, bottom: 500 };
  it("judges by the middle", () => {
    expect(unreadJumpEdgeOf({ top: 60, bottom: 92 }, view)).toBe("above");
    // Half under the pinned heading, middle still on screen.
    expect(unreadJumpEdgeOf({ top: 90, bottom: 122 }, view)).toBe("in");
    expect(unreadJumpEdgeOf({ top: 490, bottom: 522 }, view)).toBe("below");
  });
});

describe("unreadJumpState", () => {
  const t = (key: string, addressed = false): UnreadJumpTarget => ({
    key,
    addressed,
  });
  const targets = [t("a", true), t("b"), t("c"), t("d"), t("e", true), t("f")];
  const edges: Record<string, UnreadJumpEdge | null> = {
    a: "above",
    b: "above",
    c: "in",
    d: "below",
    e: "below",
    f: null,
  };

  it("goes to the nearest one out of view on each side, red when any there addresses the member", () => {
    const state = unreadJumpState(targets, (x) => edges[x.key] ?? null);
    expect(state.above).toEqual({ next: t("b"), addressed: true });
    expect(state.below).toEqual({ next: t("d"), addressed: true });
  });

  it("draws no pill on a side with nothing out of view", () => {
    expect(unreadJumpState(targets, () => "in")).toEqual(NO_UNREAD_JUMP);
  });

  it("compares by what is drawn", () => {
    const a = unreadJumpState(targets, (x) => edges[x.key] ?? null);
    const b = unreadJumpState(
      targets.map((x) => ({ ...x })),
      (x) => edges[x.key] ?? null,
    );
    expect(sameUnreadJumpState(a, b)).toBe(true);
    expect(sameUnreadJumpState(a, NO_UNREAD_JUMP)).toBe(false);
  });
});

describe("unreadJumpLabel", () => {
  it("names the direction", () => {
    expect(unreadJumpLabel("above")).toBe("Jump to unread channels above");
    expect(unreadJumpLabel("below")).toBe("Jump to unread channels below");
  });
});
