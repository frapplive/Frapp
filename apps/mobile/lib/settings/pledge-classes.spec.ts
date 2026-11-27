import { describe, expect, it } from "vitest";
import {
  addableClassMembers,
  classMemberCounts,
  classRowsOf,
  moveClassRow,
  type ClassMember,
} from "./pledge-classes";

const member = (
  id: string,
  name: string,
  pledge_class_id: string | null,
  order_number: number | null = null,
): ClassMember => ({
  id,
  user_id: `u-${id}`,
  display_name: name,
  pledge_class_id,
  order_number,
});

const classes = [{ id: "alpha" }, { id: "beta" }];
const roster = [
  member("1", "Cole", "alpha", 12),
  member("2", "Abe", "alpha", 10),
  member("3", "Dan", "beta", 20),
  member("4", "Bea", null),
  member("5", "Ann", null),
];

describe("the phone's pledge class rules (#6029)", () => {
  it("counts each class's members", () => {
    const counts = classMemberCounts(roster);
    expect(counts.get("alpha")).toBe(2);
    expect(counts.get("beta")).toBe(1);
    expect(counts.has("gamma")).toBe(false);
  });

  it("lists a class's members in fraternal order", () => {
    expect(classRowsOf(roster, "alpha", classes)).toEqual([
      { memberId: "2", name: "Abe", number: "10" },
      { memberId: "1", name: "Cole", number: "12" },
    ]);
  });

  it("moves a row and keeps the numbers following the list", () => {
    const rows = classRowsOf(roster, "alpha", classes);
    expect(moveClassRow(rows, "1", -1)).toEqual([
      { memberId: "1", name: "Cole", number: "10" },
      { memberId: "2", name: "Abe", number: "12" },
    ]);
    expect(moveClassRow(rows, "2", -1)).toBeNull();
    expect(moveClassRow(rows, "1", 1)).toBeNull();
  });

  it("offers members in no class first, then others with where they move from", () => {
    const names = new Map([
      ["alpha", "Alpha"],
      ["beta", "Beta"],
    ]);
    const offered = addableClassMembers(roster, new Set(["1", "2"]), names);
    expect(offered.map((entry) => [entry.name, entry.movesFrom])).toEqual([
      ["Ann", null],
      ["Bea", null],
      ["Dan", "Beta"],
    ]);
  });
});
