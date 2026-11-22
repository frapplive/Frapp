import { describe, expect, it } from "vitest";
import {
  eventRosterCounts,
  eventRosterRows,
  eventRosterTally,
  orderEventRoster,
} from "./event-roster";

const members = [
  { user_id: "u-2", display_name: "Marcus Lee" },
  { user_id: "u-1", display_name: "Ava Brooks", avatar_url: "a.png" },
];

describe("eventRosterRows", () => {
  it("lists every member given, by name, unmarked until a row says otherwise", () => {
    const rows = eventRosterRows(members, [
      { user_id: "u-2", status: "LATE", check_in_time: "t" },
    ]);
    expect(rows.map((row) => [row.displayName, row.status])).toEqual([
      ["Ava Brooks", "UNRECORDED"],
      ["Marcus Lee", "LATE"],
    ]);
    expect(rows[0]?.avatarUrl).toBe("a.png");
  });

  it("keeps someone with a row who isn't on the list", () => {
    const rows = eventRosterRows(members, [
      { user_id: "u-9", status: "PRESENT" },
    ]);
    expect(rows).toHaveLength(3);
  });

  it("lays a just-picked answer over the read", () => {
    const rows = eventRosterRows(members, [], { "u-1": "ABSENT" });
    expect(rows[0]?.status).toBe("ABSENT");
  });
});

describe("orderEventRoster and the tally", () => {
  const rows = eventRosterRows(members, [
    { user_id: "u-1", status: "PRESENT" },
  ]);

  it("puts who didn't come first after the event, and keeps name order during it", () => {
    expect(orderEventRoster(rows, "past").map((r) => r.userId)).toEqual([
      "u-2",
      "u-1",
    ]);
    expect(orderEventRoster(rows, "live").map((r) => r.userId)).toEqual([
      "u-1",
      "u-2",
    ]);
  });

  it("says only the states someone is in", () => {
    const counts = eventRosterCounts(rows);
    expect(eventRosterTally(counts, "live")).toEqual([
      { count: 1, label: "present" },
      { count: 1, label: "not here yet" },
    ]);
    expect(eventRosterTally(counts, "past")[1]?.label).toBe("not marked");
  });
});
