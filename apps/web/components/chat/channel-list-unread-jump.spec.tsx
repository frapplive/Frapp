import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChannelList,
  type ChannelSidebarControls,
  type ChannelUnread,
  type ChatChannel,
} from "./channel-list";

/**
 * #6045 — the "New unreads" pills over the channel list's edges. jsdom lays
 * nothing out, so every `data-flip` row and heading is stood 32px apart in
 * document order, inside a 200px scroller whose own scroll moves them.
 */

const ROW = 32;
const VIEW = 200;
let scrollTop = 0;

const channels: ChatChannel[] = Array.from({ length: 12 }, (_, i) => ({
  id: `c${i}`,
  name: `ch-${String(i).padStart(2, "0")}`,
  type: "PUBLIC",
  display_order: i,
}));

function rect(top: number, bottom: number): DOMRect {
  return {
    top,
    bottom,
    left: 0,
    right: 240,
    width: 240,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollTop = 0;
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (this.dataset.testid === "scroller") return rect(0, VIEW);
      const drawn = Array.from(document.querySelectorAll("[data-flip]"));
      const index = drawn.indexOf(this);
      if (index < 0) return rect(0, 0);
      const top = index * ROW - scrollTop;
      return rect(top, top + ROW);
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

function sidebar(
  overrides: Partial<ChannelSidebarControls> = {},
): ChannelSidebarControls {
  return {
    preferences: {
      pinnedIds: new Set(),
      collapsed: new Set(),
      filters: { unreadOnly: false, hideMuted: false },
    },
    mutedChannelIds: new Set(),
    onSetPinned: vi.fn(),
    onSetCollapsed: vi.fn(),
    onSetFilters: vi.fn(),
    onClearFilters: vi.fn(),
    ...overrides,
  };
}

function list(
  unread: Map<string, ChannelUnread> | undefined,
  controls: ChannelSidebarControls = sidebar(),
  activeChannelId: string | null = null,
) {
  return (
    <div data-testid="scroller" style={{ overflowY: "auto" }}>
      <ChannelList
        channels={channels}
        activeChannelId={activeChannelId}
        viewerId="viewer"
        memberNames={{}}
        unreadByChannelId={unread}
        onPick={vi.fn()}
        sidebar={controls}
      />
    </div>
  );
}

const counts = (
  entries: Record<string, Partial<ChannelUnread>>,
): Map<string, ChannelUnread> =>
  new Map(
    Object.entries(entries).map(([id, c]) => [
      id,
      { unreadCount: c.unreadCount ?? 0, mentionCount: c.mentionCount ?? 0 },
    ]),
  );

const pill = (direction: "above" | "below") =>
  screen.queryByRole("button", {
    name: `Jump to unread channels ${direction}`,
  });

/** Scrolls the scroller and lets the pill's next frame measure. */
async function scrollTo(y: number) {
  scrollTop = y;
  await act(async () => {
    fireEvent.scroll(screen.getByTestId("scroller"));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
}

describe("New unreads pills (#6045)", () => {
  // The heading is at 0, row cN at (N + 1) * 32: c0 to c4 are on screen,
  // c5 sits half out of the 200px view, and c6 on are below it.
  it("shows the pill at the bottom while an unread channel is below, and none at the top", () => {
    render(list(counts({ c9: { unreadCount: 3 } })));
    expect(pill("below")).toHaveTextContent("New unreads");
    expect(pill("below")).not.toHaveAttribute("data-addressed");
    expect(pill("above")).toBeNull();
  });

  it("draws nothing while every unread channel is in view", () => {
    render(list(counts({ c1: { unreadCount: 3 } })));
    expect(pill("below")).toBeNull();
    expect(pill("above")).toBeNull();
  });

  it("is red when an unread out of view that way mentions the member", () => {
    render(
      list(
        counts({
          c7: { unreadCount: 2 },
          c10: { unreadCount: 1, mentionCount: 1 },
        }),
      ),
    );
    expect(pill("below")).toHaveAttribute("data-addressed");
  });

  it("ignores a muted channel's plain unread, but not its mention", () => {
    const muted = sidebar({ mutedChannelIds: new Set(["c8", "c9"]) });
    const { rerender } = render(
      list(counts({ c8: { unreadCount: 5 } }), muted),
    );
    expect(pill("below")).toBeNull();
    rerender(list(counts({ c9: { unreadCount: 1, mentionCount: 1 } }), muted));
    expect(pill("below")).toHaveAttribute("data-addressed");
  });

  it("draws nothing while the counts are unknown", () => {
    render(list(undefined));
    expect(pill("below")).toBeNull();
  });

  it("scrolls the nearest unread below into view and lights it, without opening it", () => {
    const onPick = vi.fn();
    render(
      <div data-testid="scroller" style={{ overflowY: "auto" }}>
        <ChannelList
          channels={channels}
          activeChannelId={null}
          viewerId="viewer"
          memberNames={{}}
          unreadByChannelId={counts({
            c8: { unreadCount: 1 },
            c11: { unreadCount: 1 },
          })}
          onPick={onPick}
          sidebar={sidebar()}
        />
      </div>,
    );
    fireEvent.click(pill("below")!);
    const row = document.querySelector('[data-flip="row:c8"]')!;
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(row);
    expect(scrollIntoView.mock.calls[0]![0]).toMatchObject({
      block: "center",
    });
    expect(row.className).toContain("[&>button]:bg-card");
    expect(onPick).not.toHaveBeenCalled();
  });

  it("moves to the top once the list scrolls past the unread channel, and walks on", async () => {
    render(list(counts({ c1: { unreadCount: 1 }, c2: { unreadCount: 1 } })));
    expect(pill("above")).toBeNull();
    await scrollTo(10 * ROW);
    expect(pill("above")).not.toBeNull();
    expect(pill("below")).toBeNull();
    fireEvent.click(pill("above")!);
    // The nearest one above is the lower of the two.
    expect(scrollIntoView.mock.contexts[0]).toBe(
      document.querySelector('[data-flip="row:c2"]'),
    );
  });

  it("hides when the unread channel is read, live", () => {
    const { rerender } = render(list(counts({ c9: { unreadCount: 3 } })));
    expect(pill("below")).not.toBeNull();
    rerender(list(counts({ c9: { unreadCount: 0 } })));
    expect(pill("below")).toBeNull();
    rerender(list(counts({ c11: { unreadCount: 1, mentionCount: 1 } })));
    expect(pill("below")).toHaveAttribute("data-addressed");
  });

  it("counts a folded heading's unread total, and takes the member to the heading", () => {
    const folded = sidebar({
      preferences: {
        pinnedIds: new Set(["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7"]),
        collapsed: new Set(["channels"]),
        filters: { unreadOnly: false, hideMuted: false },
      },
    });
    // Pinned's heading and eight rows, then the folded Channels heading at
    // 288px, below the view, folding c9's mention.
    render(list(counts({ c9: { unreadCount: 2, mentionCount: 1 } }), folded));
    expect(pill("below")).toHaveAttribute("data-addressed");
    fireEvent.click(pill("below")!);
    expect(scrollIntoView.mock.contexts[0]).toBe(
      document.querySelector('[data-flip="head:channels"]'),
    );
  });

  it("never counts the open channel", () => {
    render(list(counts({ c9: { unreadCount: 3 } }), sidebar(), "c9"));
    expect(pill("below")).toBeNull();
  });
});
