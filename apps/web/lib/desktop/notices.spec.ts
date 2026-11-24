import { describe, expect, it } from "vitest";
import { type NoticeRow, planDesktopNotices, unreadNonChatCount } from "./notices";

const SINCE = Date.parse("2026-11-24T10:00:00Z");
const base = { announced: new Set<string>(), since: SINCE, viewingChannelId: null };

function row(id: string, over: Partial<NoticeRow> = {}): NoticeRow {
  return {
    id,
    title: "Ryan in #general",
    body: "are we still on for tonight?",
    read_at: null,
    created_at: "2026-11-24T10:05:00Z",
    data: { target: { screen: "chat", channelId: "c-1" } },
    ...over,
  };
}

describe("planDesktopNotices", () => {
  it("raises a new unread row with its title and words", () => {
    expect(planDesktopNotices([row("n-1")], base)).toEqual([
      { id: "n-1", tag: "chat:c-1", title: "Ryan in #general", body: "are we still on for tonight?" },
    ]);
  });

  it("raises nothing for a row already handled, read, or older than this launch", () => {
    expect(planDesktopNotices([row("n-1")], { ...base, announced: new Set(["n-1"]) })).toEqual([]);
    expect(planDesktopNotices([row("n-1", { read_at: "2026-11-24T10:06:00Z" })], base)).toEqual([]);
    expect(planDesktopNotices([row("n-1", { created_at: "2026-11-24T09:59:00Z" })], base)).toEqual([]);
    expect(planDesktopNotices([row("n-1", { created_at: "not a date" })], base)).toEqual([]);
  });

  it("stays quiet for a row sent during quiet hours or Do Not Disturb", () => {
    const quiet = row("n-1", { data: { target: { screen: "events" }, priority: "SILENT" } });
    expect(planDesktopNotices([quiet], base)).toEqual([]);
    const urgent = row("n-2", { data: { target: { screen: "chat", channelId: "c-1" }, priority: "URGENT" } });
    expect(planDesktopNotices([urgent], base)).toHaveLength(1);
  });

  it("stays quiet for the channel on screen, and only that one", () => {
    const rows = [row("n-1"), row("n-2", { data: { target: { screen: "chat", channelId: "c-2" } } })];
    expect(planDesktopNotices(rows, { ...base, viewingChannelId: "c-1" }).map((n) => n.id)).toEqual(["n-2"]);
  });

  it("keeps one notification per conversation, the newest", () => {
    const rows = [
      row("n-1", { created_at: "2026-11-24T10:05:00Z", body: "first" }),
      row("n-2", { created_at: "2026-11-24T10:06:00Z", body: "second" }),
    ];
    expect(planDesktopNotices(rows, base)).toEqual([
      expect.objectContaining({ id: "n-2", tag: "chat:c-1", body: "second" }),
    ]);
  });

  it("gives a row outside chat its own notification", () => {
    const event = row("n-9", { title: "Chapter meeting moved", data: { target: { screen: "events" } } });
    expect(planDesktopNotices([event], base)[0]).toMatchObject({ id: "n-9", tag: "n-9" });
  });

  it("raises at most three at once, the newest, oldest first", () => {
    const rows = [1, 2, 3, 4, 5].map((n) =>
      row(`n-${n}`, {
        created_at: `2026-11-24T10:0${n}:00Z`,
        data: { target: { screen: "chat", channelId: `c-${n}` } },
      }),
    );
    expect(planDesktopNotices(rows, base).map((n) => n.id)).toEqual(["n-3", "n-4", "n-5"]);
  });

  it("drops the object-replacement box from the words", () => {
    expect(planDesktopNotices([row("n-1", { body: "￼ photo" })], base)[0]?.body).toBe("photo");
  });
});

describe("unreadNonChatCount", () => {
  it("counts unread rows that aren't about a chat message", () => {
    expect(
      unreadNonChatCount([
        row("a"),
        row("b", { data: { target: { screen: "events" } } }),
        row("c", { data: { target: { screen: "tasks" } }, read_at: "2026-11-24T10:06:00Z" }),
        row("d", { data: null }),
      ]),
    ).toBe(2);
  });
});
