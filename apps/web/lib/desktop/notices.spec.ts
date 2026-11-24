import { describe, expect, it } from "vitest";
import { type NoticeRow, newestRowTime, planDesktopNotices } from "./notices";

const SINCE = Date.parse("2026-11-24T10:00:00Z");
const base = { announced: new Set<string>(), since: SINCE };

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
      {
        id: "n-1",
        unreadIds: ["n-1"],
        tag: "chat:c-1",
        title: "Ryan in #general",
        body: "are we still on for tonight?",
        silent: false,
      },
    ]);
  });

  it("raises nothing for a row already handled, read, or older than this launch", () => {
    expect(planDesktopNotices([row("n-1")], { ...base, announced: new Set(["n-1"]) })).toEqual([]);
    expect(planDesktopNotices([row("n-1", { read_at: "2026-11-24T10:06:00Z" })], base)).toEqual([]);
    expect(planDesktopNotices([row("n-1", { created_at: "2026-11-24T09:59:00Z" })], base)).toEqual([]);
    expect(planDesktopNotices([row("n-1", { created_at: "not a date" })], base)).toEqual([]);
  });

  it("stays quiet for a row quiet hours or Do Not Disturb lowered, and only those", () => {
    const quieted = row("n-1", {
      data: { target: { screen: "events" }, priority: "SILENT", quieted: true },
    });
    expect(planDesktopNotices([quieted], base)).toEqual([]);
    const urgent = row("n-2", { data: { target: { screen: "chat", channelId: "c-1" }, priority: "URGENT" } });
    expect(planDesktopNotices([urgent], base)).toHaveLength(1);
  });

  it("shows a row its sender marked low priority, without a sound", () => {
    // "New event created" goes out SILENT to everyone: a phone shows it and
    // makes no sound, and so does this.
    const low = row("n-1", { data: { target: { screen: "events" }, priority: "SILENT" } });
    expect(planDesktopNotices([low], base)).toEqual([expect.objectContaining({ id: "n-1", silent: true })]);
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

  it("stands for every unread row of the conversation, so a click reads them all (#3948)", () => {
    const rows = [
      row("n-1", { created_at: "2026-11-24T09:00:00Z" }),
      row("n-2", { created_at: "2026-11-24T09:30:00Z", read_at: "2026-11-24T09:31:00Z" }),
      row("n-3", { created_at: "2026-11-24T10:06:00Z" }),
      row("n-4", { data: { target: { screen: "chat", channelId: "c-2" } } }),
    ];
    const notices = planDesktopNotices(rows, { ...base, announced: new Set(["n-1", "n-2"]) });
    expect(notices.find((n) => n.id === "n-3")?.unreadIds).toEqual(["n-1", "n-3"]);
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

describe("newestRowTime", () => {
  it("is the newest row's own time, from the server's clock", () => {
    expect(
      newestRowTime([
        row("a", { created_at: "2026-11-24T09:00:00Z" }),
        row("b", { created_at: "2026-11-24T10:05:00Z" }),
        row("c", { created_at: "not a date" }),
      ]),
    ).toBe(Date.parse("2026-11-24T10:05:00Z"));
  });

  it("is 0 for an empty list, so everything after it is news", () => {
    expect(newestRowTime([])).toBe(0);
  });
});
