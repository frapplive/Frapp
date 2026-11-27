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
    findChannels: [],
    unread: [],
    recent: [],
    countsKnown: true,
    countsFor: () => undefined,
    looksUnread: () => false,
    isMuted: () => false,
    categoryOf: () => undefined,
    ...over,
  };
}

function render(
  letters: string,
  jump: ChannelJump,
  onOpen = vi.fn(),
  showMoreNote = true,
): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <FrappThemeProvider>
        <ChannelJumpList
          letters={letters}
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
    // Chat home's words for each row, then its category.
    expect(rowLabels(tree)).toEqual([
      "#exec, 1 mention, 3 unread",
      "#rush-events, 4 unread, Recruitment",
      "#general",
    ]);
    // Only the mention carries a number (foundations §5).
    expect(tree.root.findAllByType(UnreadBadge)).toHaveLength(1);
    // Nothing typed: no "from 3 letters" line yet.
    expect(text).not.toContain("from 3 letters");
  });

  it("says how to jump when nothing is unread or recently opened", () => {
    const tree = render("", jumpOf());
    expect(rowLabels(tree)).toEqual([]);
    expect(drawnText(tree.root)).toContain(
      "Nothing unread. Type a channel's name to jump to it.",
    );
  });

  it("says nothing of the kind while the unread counts are unknown", () => {
    const tree = render("", jumpOf({ countsKnown: false }));
    expect(drawnText(tree.root)).not.toContain("Nothing unread");
  });

  it("says a muted or private channel is so, as Chat home does", () => {
    const secret = { ...ch("c-sec", "secret"), type: "PRIVATE" };
    const tree = render(
      "",
      jumpOf({
        channels: [secret],
        unread: [secret],
        countsFor: () => ({ unreadCount: 2, mentionCount: 1 }),
        looksUnread: () => true,
        isMuted: () => true,
      }),
    );
    expect(rowLabels(tree)).toEqual([
      "#secret, private channel, muted, 1 mention, 2 unread",
    ]);
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
