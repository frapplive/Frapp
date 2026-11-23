import { describe, expect, it } from "vitest";
import type { RushPipelineCandidate, RushStage } from "@repo/hooks";
import {
  openProspectCount,
  rowTags,
  rushStageTabs,
  rushTagLabels,
} from "./rush-entry";

/**
 * The recruitment list's chips (#5924): the board's columns, one stage at a
 * time, with every Closed stage folded into one chip.
 */

function stage(
  key: string,
  category: RushStage["category"],
  position: number,
  hidden = false,
): RushStage {
  return {
    id: key,
    chapter_id: "c",
    key,
    label: key.toUpperCase(),
    category,
    position,
    hidden,
    created_at: "",
    updated_at: "",
  };
}

function candidate(id: string, stageKey: string, day: number) {
  return {
    id,
    display_name: id,
    user_id: null,
    stage: stageKey,
    closed_reason: null,
    bid_status: "none",
    created_by: "u",
    created_by_name: "U",
    created_at: `2026-11-${String(day).padStart(2, "0")}T00:00:00.000Z`,
    tag_ids: [],
    viewer_rating: null,
    viewer_has_voted: false,
  } as RushPipelineCandidate;
}

// Out of order on purpose: the chips follow category, then position.
const STAGES = [
  stage("passed", "closed", 0),
  stage("met", "met", 0),
  stage("new", "new", 0),
  stage("old-met", "met", 1, true),
  stage("empty-hidden", "engaged", 0, true),
  stage("withdrew", "closed", 1),
];

describe("rushStageTabs", () => {
  it("draws each visible stage in order, then one Closed chip holding every Closed stage", () => {
    const tabs = rushStageTabs(STAGES, [
      candidate("a", "passed", 1),
      candidate("b", "withdrew", 2),
      candidate("c", "new", 3),
    ]);
    expect(tabs.map((tab) => tab.id)).toEqual(["new", "met", "closed"]);
    const closed = tabs.at(-1)!;
    expect(closed).toMatchObject({ label: "Closed", closed: true });
    // Newest first.
    expect(closed.candidates.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("keeps a hidden stage that still holds prospects, so nobody goes missing", () => {
    const tabs = rushStageTabs(STAGES, [candidate("a", "old-met", 1)]);
    expect(tabs.map((tab) => tab.id)).toEqual([
      "new",
      "met",
      "old-met",
      "closed",
    ]);
  });

  it("marks the New stage as the one adds land in", () => {
    const tabs = rushStageTabs(STAGES, []);
    expect(tabs.filter((tab) => tab.receivesAdds).map((t) => t.id)).toEqual([
      "new",
    ]);
  });
});

describe("openProspectCount", () => {
  it("counts everyone not in a Closed stage", () => {
    expect(
      openProspectCount(STAGES, [
        candidate("a", "passed", 1),
        candidate("b", "new", 1),
        candidate("c", "old-met", 1),
      ]),
    ).toBe(2);
  });
});

describe("a row's tags", () => {
  const tags = ["t1", "t2", "t3"].map((id, index) => ({
    id,
    chapter_id: "c",
    label: `Tag ${index + 1}`,
    created_at: "",
  }));

  it("names them in the chapter's order and skips an unknown id", () => {
    expect(rushTagLabels(["t3", "gone", "t1"], tags)).toEqual([
      "Tag 1",
      "Tag 3",
    ]);
  });

  it("shows two, then a count of the rest", () => {
    expect(rowTags(["a", "b"])).toEqual({ shown: ["a", "b"], more: 0 });
    expect(rowTags(["a", "b", "c", "d"])).toEqual({
      shown: ["a", "b"],
      more: 2,
    });
  });
});
