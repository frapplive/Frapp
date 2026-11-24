import { describe, expect, it } from "vitest";
import { STANDINGS_WINDOWS, rankStandings } from "./standings";

describe("rankStandings", () => {
  it("places the highest total first, whatever order the board arrives in", () => {
    const places = rankStandings([
      { user_id: "b", total: 10 },
      { user_id: "a", total: 30 },
    ]);
    expect(places.get("a")).toEqual({ rank: 1, total: 30 });
    expect(places.get("b")).toEqual({ rank: 2, total: 10 });
  });

  it("lets equal totals share a place, and skips the places they take (1, 1, 3)", () => {
    const places = rankStandings([
      { user_id: "a", total: 20 },
      { user_id: "b", total: 20 },
      { user_id: "c", total: 5 },
    ]);
    expect([...places.values()].map((place) => place.rank)).toEqual([1, 1, 3]);
  });

  it("ranks nobody on an empty board", () => {
    expect(rankStandings([]).size).toBe(0);
  });
});

describe("STANDINGS_WINDOWS", () => {
  it("offers this semester first, the period standings open on", () => {
    expect(STANDINGS_WINDOWS.map((window) => window.value)).toEqual([
      "semester",
      "month",
      "all",
    ]);
  });
});
