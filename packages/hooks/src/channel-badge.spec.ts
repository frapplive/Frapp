import { describe, expect, it } from "vitest";
import { badgeLabel, unreadAnnouncement } from "./channel-badge";

describe("badgeLabel", () => {
  it("shows the plain unread count with no @ when there is no mention", () => {
    expect(badgeLabel(3, 0)).toBe("3");
  });

  it("leads with @ and shows the mention count, not the total, when both are present", () => {
    expect(badgeLabel(12, 2)).toBe("@ 2");
  });

  it("caps at 99+", () => {
    expect(badgeLabel(140, 0)).toBe("99+");
    expect(badgeLabel(1, 100)).toBe("@ 99+");
  });
});

describe("unreadAnnouncement", () => {
  it("names both the mention count and the unread total when there is a mention", () => {
    expect(unreadAnnouncement({ unreadCount: 5, mentionCount: 2 })).toBe(
      "2 mentions, 5 unread",
    );
  });

  it("pluralizes a single mention correctly", () => {
    expect(unreadAnnouncement({ unreadCount: 1, mentionCount: 1 })).toBe(
      "1 mention, 1 unread",
    );
  });

  it("announces a direct message distinctly from a channel", () => {
    expect(unreadAnnouncement({ unreadCount: 3, mentionCount: 0 }, true)).toBe(
      "3 unread direct messages",
    );
    expect(unreadAnnouncement({ unreadCount: 3, mentionCount: 0 }, false)).toBe(
      "3 unread messages",
    );
  });
});
