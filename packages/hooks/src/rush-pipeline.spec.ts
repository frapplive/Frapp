import { describe, expect, it } from "vitest";
import {
  rushBoardColumns,
  rushCandidatesByColumn,
  rushPipelineAccess,
  rushRatingSummary,
  rushStageLabel,
  type RushCandidateLike,
  type RushStageView,
} from "./rush-pipeline";

const stage = (
  key: string,
  category: RushStageView["category"],
  position: number,
  hidden = false,
  label = key,
): RushStageView => ({
  id: `id-${key}`,
  key,
  label,
  category,
  position,
  hidden,
});

const prospect = (
  id: string,
  stageKey: string,
  createdAt: string,
): RushCandidateLike => ({ id, stage: stageKey, created_at: createdAt });

const STAGES = [
  stage("new", "new", 0, false, "New"),
  stage("contacted", "contacted", 1, false, "Contacted"),
  stage("met", "met", 2, true, "Met"),
  stage("closed", "closed", 3, false, "Closed"),
  stage("s_passed", "closed", 4, false, "Passed"),
];

describe("rushPipelineAccess (#5924)", () => {
  const none = {
    view: false,
    add: false,
    move: false,
    writeNotes: false,
    readNotes: false,
    vote: false,
    viewResults: false,
    manage: false,
  };

  it.each([null, undefined, []])(
    "allows nothing before the permissions are read (%s)",
    (permissions) => {
      expect(rushPipelineAccess(permissions)).toEqual(none);
    },
  );

  it("allows everything for the wildcard", () => {
    const access = rushPipelineAccess(["*"]);
    expect(Object.values(access).every(Boolean)).toBe(true);
  });

  it("allows nothing without members:view, whatever rush keys are held", () => {
    expect(
      rushPipelineAccess([
        "rush:view",
        "rush:add",
        "rush:notes",
        "rush:read_notes",
        "rush:vote",
        "rush:view_results",
        "rush:manage",
      ]),
    ).toEqual(none);
  });

  it("maps each key to its control once the page is viewable", () => {
    expect(
      rushPipelineAccess([
        "members:view",
        "rush:view",
        "rush:add",
        "rush:read_notes",
      ]),
    ).toEqual({
      ...none,
      view: true,
      add: true,
      move: true,
      readNotes: true,
    });
  });
});

describe("rushBoardColumns", () => {
  it("folds every Closed stage into one column at the end", () => {
    const columns = rushBoardColumns(STAGES, []);
    expect(columns.map((c) => c.id)).toEqual(["new", "contacted", "closed"]);
    const closed = columns[columns.length - 1];
    expect(closed).toMatchObject({ label: "Closed", category: "closed" });
    expect(closed?.stages.map((s) => s.key)).toEqual(["closed", "s_passed"]);
  });

  it("leaves out a hidden stage nobody is in", () => {
    expect(rushBoardColumns(STAGES, []).map((c) => c.id)).not.toContain("met");
  });

  it("keeps a hidden stage's column while a prospect is in it", () => {
    const columns = rushBoardColumns(STAGES, [
      prospect("p1", "met", "2026-01-01T00:00:00.000Z"),
    ]);
    expect(columns.map((c) => c.id)).toEqual([
      "new",
      "contacted",
      "met",
      "closed",
    ]);
  });

  it("has no Closed column when every Closed stage is hidden and empty", () => {
    const stages = STAGES.map((s) =>
      s.category === "closed" ? { ...s, hidden: true } : s,
    );
    expect(rushBoardColumns(stages, []).map((c) => c.id)).toEqual([
      "new",
      "contacted",
    ]);
  });
});

describe("rushCandidatesByColumn", () => {
  const columns = rushBoardColumns(STAGES, []);

  it("puts each prospect in its column, newest first", () => {
    const byColumn = rushCandidatesByColumn(columns, [
      prospect("old", "new", "2026-01-01T00:00:00.000Z"),
      prospect("newer", "new", "2026-03-01T00:00:00.000Z"),
      prospect("passed", "s_passed", "2026-02-01T00:00:00.000Z"),
      prospect("closed", "closed", "2026-04-01T00:00:00.000Z"),
    ]);
    expect(byColumn.get("new")?.map((c) => c.id)).toEqual(["newer", "old"]);
    expect(byColumn.get("contacted")).toEqual([]);
    expect(byColumn.get("closed")?.map((c) => c.id)).toEqual([
      "closed",
      "passed",
    ]);
  });

  it("puts a prospect in an unknown stage in the first column", () => {
    const byColumn = rushCandidatesByColumn(columns, [
      prospect("lost", "s_gone", "2026-01-01T00:00:00.000Z"),
    ]);
    expect(byColumn.get("new")?.map((c) => c.id)).toEqual(["lost"]);
  });
});

describe("rushStageLabel", () => {
  it("appends the reason for a Closed stage", () => {
    expect(
      rushStageLabel(STAGES, {
        stage: "s_passed",
        closed_reason: "chapter_passed",
      }),
    ).toBe("Passed · Chapter passed");
  });

  it("is the bare label for a working stage", () => {
    expect(rushStageLabel(STAGES, { stage: "contacted" })).toBe("Contacted");
  });

  it("says so for a stage the chapter doesn't have", () => {
    expect(rushStageLabel(STAGES, { stage: "s_gone" })).toBe("Unknown stage");
  });
});

describe("rushRatingSummary", () => {
  it("is null when results are left out", () => {
    expect(rushRatingSummary({})).toBeNull();
  });

  it("says no ratings yet at zero", () => {
    expect(rushRatingSummary({ rating_average: null, rating_count: 0 })).toBe(
      "No ratings yet",
    );
  });

  it("is singular for one rating", () => {
    expect(rushRatingSummary({ rating_average: 4, rating_count: 1 })).toBe(
      "★ 4 · 1 rating",
    );
  });

  it("rounds the average and pluralises", () => {
    expect(rushRatingSummary({ rating_average: 3.66, rating_count: 6 })).toBe(
      "★ 3.7 · 6 ratings",
    );
  });
});
