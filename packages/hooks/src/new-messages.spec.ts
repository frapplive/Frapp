import { describe, expect, it } from "vitest";
import {
  advancePill,
  dividerSide,
  newMessagesCountLabel,
  newMessagesMark,
  newMessagesPillLabel,
  PILL_START,
  pillDirection,
  placeNewMessagesDivider,
  readArrival,
  type NewMessagesRow,
} from "./new-messages";

const READ_AT = "2026-11-25T10:00:00.000Z";
const mark = { lastReadAt: READ_AT, count: 3 };

function row(
  id: string,
  minute: number,
  extra: Partial<NewMessagesRow> = {},
): NewMessagesRow {
  return {
    id,
    createdAt: `2026-11-25T10:${String(minute).padStart(2, "0")}:00.000Z`,
    own: false,
    silent: false,
    ...extra,
  };
}

describe("readArrival", () => {
  const counts = [
    {
      channel_id: "c1",
      unread_count: 4,
      mention_count: 0,
      last_read_at: READ_AT,
    },
    { channel_id: "c2", unread_count: 0, mention_count: 0, last_read_at: null },
  ];

  it("reads the channel's count and cursor", () => {
    expect(readArrival(counts, "c1")).toEqual({
      unread: 4,
      lastReadAt: READ_AT,
    });
    expect(readArrival(counts, "c2")).toEqual({ unread: 0, lastReadAt: null });
  });

  it("has no cursor from an API that sends none", () => {
    expect(readArrival([{ channel_id: "c1", unread_count: 2 }], "c1")).toEqual({
      unread: 2,
      lastReadAt: null,
    });
  });

  it("is null without an answer, a row, or a channel", () => {
    expect(readArrival(undefined, "c1")).toBeNull();
    expect(readArrival({ items: counts }, "c1")).toBeNull();
    expect(readArrival(counts, "c9")).toBeNull();
    expect(readArrival(counts, null)).toBeNull();
    expect(
      readArrival([{ channel_id: "c1", unread_count: "4" }], "c1"),
    ).toBeNull();
  });
});

describe("newMessagesMark", () => {
  it("marks an open with something new and a cursor", () => {
    expect(newMessagesMark({ unread: 3, lastReadAt: READ_AT })).toEqual(mark);
  });

  it("marks nothing when nothing is new", () => {
    expect(newMessagesMark({ unread: 0, lastReadAt: READ_AT })).toBeNull();
    expect(newMessagesMark(null)).toBeNull();
  });

  it("marks nothing in a channel never opened, or an unreadable cursor", () => {
    expect(newMessagesMark({ unread: 40, lastReadAt: null })).toBeNull();
    expect(newMessagesMark({ unread: 4, lastReadAt: "soon" })).toBeNull();
  });
});

describe("placeNewMessagesDivider", () => {
  it("goes above the first message after the cursor", () => {
    const rows = [row("a", 0), row("b", 5), row("c", 6)];
    expect(placeNewMessagesDivider(rows, mark, true)).toEqual({
      at: "row",
      id: "b",
    });
  });

  it("is strictly after the cursor: a message at it was read", () => {
    const rows = [row("a", 0), row("b", 1)];
    expect(placeNewMessagesDivider(rows, mark, true)).toEqual({
      at: "row",
      id: "b",
    });
  });

  it("skips the viewer's own messages and rows with nothing to read", () => {
    const rows = [
      row("a", 0),
      row("own", 2, { own: true }),
      row("deleted", 3, { silent: true }),
      row("theirs", 4),
    ];
    expect(placeNewMessagesDivider(rows, mark, true)).toEqual({
      at: "row",
      id: "theirs",
    });
  });

  it("points into older history when the loaded rows are all new", () => {
    const rows = [row("b", 5), row("c", 6)];
    expect(placeNewMessagesDivider(rows, mark, true)).toEqual({ at: "older" });
  });

  it("goes above the channel's first message when there is no older history", () => {
    const rows = [row("b", 5), row("c", 6)];
    expect(placeNewMessagesDivider(rows, mark, false)).toEqual({
      at: "row",
      id: "b",
    });
  });

  it("keeps looking older when everything loaded after the cursor is the viewer's", () => {
    const rows = [row("own", 5, { own: true })];
    expect(placeNewMessagesDivider(rows, mark, true)).toEqual({ at: "older" });
  });

  it("draws none when nothing after the cursor is new to the member", () => {
    const rows = [row("a", 0), row("own", 5, { own: true })];
    expect(placeNewMessagesDivider(rows, mark, true)).toBeNull();
    expect(placeNewMessagesDivider([row("a", 0)], mark, false)).toBeNull();
  });

  it("draws none without a mark or rows", () => {
    expect(placeNewMessagesDivider([row("b", 5)], null, true)).toBeNull();
    expect(placeNewMessagesDivider([], mark, true)).toBeNull();
  });

  it("stays put when a later read stamp would have moved it", () => {
    // The mark is the open's; rows arriving after it change nothing above.
    const rows = [row("a", 0), row("b", 5), row("c", 6), row("later", 30)];
    expect(placeNewMessagesDivider(rows, mark, true)).toEqual({
      at: "row",
      id: "b",
    });
  });
});

describe("dividerSide", () => {
  const visible = { first: 10, last: 20 };

  it("is shown inside what is on screen", () => {
    expect(dividerSide(10, visible)).toBe("shown");
    expect(dividerSide(20, visible)).toBe("shown");
  });

  it("is above an older row and below a newer one", () => {
    expect(dividerSide(4, visible)).toBe("above");
    expect(dividerSide(25, visible)).toBe("below");
  });

  it("is unknown before anything is on screen or without a row", () => {
    expect(dividerSide(4, null)).toBeNull();
    expect(dividerSide(-1, visible)).toBeNull();
  });
});

describe("the pill", () => {
  const place = { at: "row", id: "b" } as const;

  it("points up at a divider the member read down past, and down at one below", () => {
    expect(pillDirection(place, "above", PILL_START)).toBe("up");
    expect(pillDirection(place, "below", PILL_START)).toBe("down");
  });

  it("points up at a divider still in history to load", () => {
    expect(pillDirection({ at: "older" }, null, PILL_START)).toBe("up");
  });

  it("is gone while the divider is on screen, or there is none", () => {
    expect(pillDirection(place, "shown", PILL_START)).toBeNull();
    expect(pillDirection(place, null, PILL_START)).toBeNull();
    expect(pillDirection(null, "above", PILL_START)).toBeNull();
  });

  it("retires once the member saw the divider and read through to the newest", () => {
    let progress = advancePill(PILL_START, "shown", false);
    expect(progress.seen).toBe(true);
    expect(pillDirection(place, "above", progress)).toBe("up");
    progress = advancePill(progress, "above", true);
    expect(progress.readThrough).toBe(true);
    expect(pillDirection(place, "below", progress)).toBeNull();
  });

  it("stays while the member is at the newest without having seen the divider", () => {
    const progress = advancePill(PILL_START, "above", true);
    expect(progress).toBe(PILL_START);
    expect(pillDirection(place, "above", progress)).toBe("up");
  });

  it("goes when dismissed with Mark as read", () => {
    expect(
      pillDirection(place, "above", { ...PILL_START, dismissed: true }),
    ).toBeNull();
  });
});

describe("labels", () => {
  it("counts in words, capped at 99+", () => {
    expect(newMessagesCountLabel(1)).toBe("1 new message");
    expect(newMessagesCountLabel(12)).toBe("12 new messages");
    expect(newMessagesCountLabel(99)).toBe("99 new messages");
    expect(newMessagesCountLabel(140)).toBe("99+ new messages");
  });

  it("says which way the pill goes", () => {
    expect(newMessagesPillLabel(12, "up")).toBe(
      "12 new messages above. Jump to the first one",
    );
    expect(newMessagesPillLabel(1, "down")).toBe(
      "1 new message below. Jump to the first one",
    );
  });
});
