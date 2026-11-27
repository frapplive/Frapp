import { describe, expect, it } from "vitest";
import {
  deletePledgeClassConfirm,
  memberFieldFacts,
  memberFieldSortPatches,
  moveId,
} from "./people-settings-copy";

describe("memberFieldFacts", () => {
  it("says the type, then the flags", () => {
    expect(
      memberFieldFacts({
        type: "select",
        required: true,
        sensitive: false,
        options: { choices: ["S", "M", "L", "XL"] },
      }),
    ).toBe("Pick one of 4 · Required");
    expect(
      memberFieldFacts({ type: "phone", required: true, sensitive: true }),
    ).toBe("Phone · Required · Sensitive");
    expect(
      memberFieldFacts({ type: "boolean", required: false, sensitive: false }),
    ).toBe("Yes or no");
  });
});

describe("memberFieldSortPatches", () => {
  it("writes only the fields whose place changed", () => {
    expect(
      memberFieldSortPatches(
        ["b", "a", "c"],
        [
          { id: "a", sort: 0 },
          { id: "b", sort: 1 },
          { id: "c", sort: 2 },
        ],
      ),
    ).toEqual([
      { id: "b", sort: 0 },
      { id: "a", sort: 1 },
    ]);
  });

  it("spreads out fields that all start at 0", () => {
    expect(
      memberFieldSortPatches(
        ["a", "b"],
        [
          { id: "a", sort: 0 },
          { id: "b", sort: 0 },
        ],
      ),
    ).toEqual([{ id: "b", sort: 1 }]);
  });
});

describe("moveId", () => {
  it("swaps with the neighbour, or refuses at an end", () => {
    expect(moveId(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveId(["a", "b", "c"], "c", 1)).toBeNull();
    expect(moveId(["a"], "x", 1)).toBeNull();
  });
});

describe("deletePledgeClassConfirm", () => {
  it("says how many are left without one", () => {
    expect(deletePledgeClassConfirm("Fall 2024", 5).body).toBe(
      "Its 5 members are left without one. They keep their number.",
    );
    expect(deletePledgeClassConfirm("Fall 2024", 1).body).toBe(
      "Its 1 member is left without one. They keep their number.",
    );
    expect(deletePledgeClassConfirm("Fall 2024", 0).body).toBe(
      "No members are in it.",
    );
  });
});
