/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { ChannelJump, JumpChannel } from "@repo/hooks";
import { FrappThemeProvider } from "@/lib/theme";
import { drawnText } from "@/test/screen-text";
import { PressableRow } from "@/components/list-section";
import { UnreadBadge } from "@/components/chat/channel-row";
import { ChannelJumpList } from "./channel-jump-list";

/**
 * Jump to a channel on the phone's Search (#6053). Which channels are unread
 * or recently opened, and the ranking, are `@repo/hooks` `channel-jump.spec.ts`;
 * this pins what the phone draws from them.
 */

const ch = (id: string, name = id): JumpChannel => ({
  id,
  name,
  type: "PUBLIC",
});
const exec = ch("c-exec", "exec");
const rush = ch("c-rush", "rush-events");
const brunch = ch("c-brunch", "brunch");
const general = ch("c-gen", "general");

function jumpOf(over: Partial<ChannelJump> = {}): ChannelJump {
  return {
    channels: [exec, rush, brunch, general],
    unread: [],
    recent: [],
    countsFor: () => undefined,
    looksUnread: () => false,
    categoryOf: () => undefined,
    ...over,
  };
}

function render(
  typed: string,
  jump: ChannelJump,
  onOpen = vi.fn(),
  showMoreNote = true,
): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <FrappThemeProvider>
        <ChannelJumpList
          typed={typed}
          jump={jump}
          onOpen={onOpen}
          showMoreNote={showMoreNote}
        />
      </FrappThemeProvider>,
    );
  });
  return tree;
}

const rowLabels = (tree: ReactTestRenderer) =>
  tree.root
    .findAllByType(PressableRow)
    .map((row) => row.props.accessibilityLabel as string);

describe("ChannelJumpList (#6053)", () => {
  it("opens on Unread then Recently opened, unread bold, a mention counted", () => {
    const tree = render(
      "",
      jumpOf({
        unread: [exec, rush],
        recent: [general],
        countsFor: (id) =>
          id === "c-exec"
            ? { unreadCount: 3, mentionCount: 1 }
            : id === "c-rush"
              ? { unreadCount: 4, mentionCount: 0 }
              : undefined,
        looksUnread: (id) => id !== "c-gen",
        categoryOf: (c) => (c.id === "c-rush" ? "Recruitment" : undefined),
      }),
    );
    const text = drawnText(tree.root);
    expect(text.indexOf("Unread")).toBeLessThan(
      text.indexOf("Recently opened"),
    );
    expect(rowLabels(tree)).toEqual([
      "#exec, 1 mention",
      "#rush-events, Recruitment, unread",
      "#general",
    ]);
    // Only the mention carries a number (foundations §5).
    expect(tree.root.findAllByType(UnreadBadge)).toHaveLength(1);
    // Nothing typed: no "from 3 letters" line yet.
    expect(text).not.toContain("from 3 letters");
  });

  it("draws nothing before typing when nothing is unread or recently opened", () => {
    expect(rowLabels(render("", jumpOf()))).toEqual([]);
  });

  it("lists the channels two letters match, best first, and opens one", () => {
    const onOpen = vi.fn();
    const tree = render("ru", jumpOf(), onOpen);
    expect(rowLabels(tree)).toEqual(["#rush-events", "#brunch"]);
    expect(drawnText(tree.root)).toContain(
      "Messages, events and more from 3 letters.",
    );
    act(() => tree.root.findAllByType(PressableRow)[0]!.props.onPress());
    expect(onOpen).toHaveBeenCalledWith(rush);
  });

  it("says so when no channel matches, and drops the line in a council", () => {
    const tree = render("zz", jumpOf(), vi.fn(), false);
    expect(drawnText(tree.root)).toContain("No channels match.");
    expect(drawnText(tree.root)).not.toContain("from 3 letters");
  });
});
