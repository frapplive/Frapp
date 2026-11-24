import { describe, expect, it } from "vitest";
import {
  DEFAULT_RUSH_STAGES,
  RUSH_STAGE_LABEL_MAX,
  RUSH_STAGES_MAX,
  firstVisibleRushStage,
  formatRushRatingAverage,
  isRushManualClosedReason,
  rushStagesProblem,
  sortRushStages,
  type RushStageCategory,
} from "./rush-pipeline";

const stage = (label: string, category: RushStageCategory, hidden = false) => ({
  label,
  category,
  hidden,
});

/** The six defaults, as the editor would send them. */
const defaults = () =>
  DEFAULT_RUSH_STAGES.map((s) => stage(s.label, s.category));

describe("rushStagesProblem (#5924)", () => {
  it("accepts the six defaults", () => {
    expect(rushStagesProblem(defaults())).toBeNull();
  });

  it("refuses an empty list", () => {
    expect(rushStagesProblem([])).toBe("Add at least one stage.");
  });

  it("refuses more than the stage cap", () => {
    const many = [
      ...defaults(),
      ...Array.from({ length: RUSH_STAGES_MAX }, (_, i) =>
        stage(`Extra ${i}`, "met"),
      ),
    ];
    expect(rushStagesProblem(many)).toBe(
      `A chapter can have up to ${RUSH_STAGES_MAX} stages.`,
    );
  });

  it("refuses a stage without a known category", () => {
    const list = [
      ...defaults(),
      stage("Odd", "bogus" as unknown as RushStageCategory),
    ];
    expect(rushStagesProblem(list)).toBe("Each stage needs a category.");
  });

  it("refuses a blank name", () => {
    expect(rushStagesProblem([...defaults(), stage("   ", "met")])).toBe(
      "Give every stage a name.",
    );
  });

  it("refuses a name over the cap, after trimming", () => {
    const long = "x".repeat(RUSH_STAGE_LABEL_MAX + 1);
    expect(rushStagesProblem([...defaults(), stage(long, "met")])).toBe(
      `Stage names can be up to ${RUSH_STAGE_LABEL_MAX} characters.`,
    );
    const padded = `  ${"x".repeat(RUSH_STAGE_LABEL_MAX)}  `;
    expect(rushStagesProblem([...defaults(), stage(padded, "met")])).toBeNull();
  });

  it("refuses two stages with the same name, ignoring case and spaces", () => {
    expect(rushStagesProblem([...defaults(), stage(" met ", "engaged")])).toBe(
      'Two stages are named "met".',
    );
  });

  it.each([
    ["new", "New"],
    ["closed", "Closed"],
  ] as const)("refuses %s with no visible stage", (category, name) => {
    const list = defaults().map((s) =>
      s.category === category ? { ...s, hidden: true } : s,
    );
    expect(rushStagesProblem(list)).toBe(
      `${name} needs at least one stage that isn't hidden.`,
    );
  });

  it("allows a hidden New stage while another New stage is visible", () => {
    const list = [
      ...defaults().map((s) =>
        s.category === "new" ? { ...s, hidden: true } : s,
      ),
      stage("Lead", "new"),
    ];
    expect(rushStagesProblem(list)).toBeNull();
  });

  it("allows every middle category to be hidden", () => {
    const list = defaults().map((s) =>
      s.category === "new" || s.category === "closed"
        ? s
        : { ...s, hidden: true },
    );
    expect(rushStagesProblem(list)).toBeNull();
  });
});

describe("sortRushStages", () => {
  it("orders by category first, then position, without mutating", () => {
    const input = [
      { key: "c2", category: "closed" as const, position: 0 },
      { key: "n2", category: "new" as const, position: 5 },
      { key: "m", category: "met" as const, position: 1 },
      { key: "n1", category: "new" as const, position: 2 },
      { key: "c1", category: "closed" as const, position: -1 },
    ];
    const copy = [...input];
    expect(sortRushStages(input).map((s) => s.key)).toEqual([
      "n1",
      "n2",
      "m",
      "c1",
      "c2",
    ]);
    expect(input).toEqual(copy);
  });
});

describe("firstVisibleRushStage", () => {
  const stages = [
    { key: "lead", category: "new" as const, position: 3, hidden: false },
    { key: "new", category: "new" as const, position: 0, hidden: true },
    { key: "walkin", category: "new" as const, position: 4, hidden: false },
    { key: "met", category: "met" as const, position: 1, hidden: true },
  ];

  it("skips hidden stages and goes by position within the category", () => {
    expect(firstVisibleRushStage(stages, "new")?.key).toBe("lead");
  });

  it("is undefined when every stage in the category is hidden", () => {
    expect(firstVisibleRushStage(stages, "met")).toBeUndefined();
  });

  it("is undefined for a category with no stages", () => {
    expect(firstVisibleRushStage(stages, "engaged")).toBeUndefined();
  });
});

describe("formatRushRatingAverage", () => {
  it.each([
    [3, "3"],
    [3.66, "3.7"],
    [3.04, "3"],
    [4.25, "4.3"],
    [1.5, "1.5"],
  ])("%s → %s", (average, expected) => {
    expect(formatRushRatingAverage(average)).toBe(expected);
  });
});

describe("isRushManualClosedReason", () => {
  it.each(["not_interested", "not_eligible", "chapter_passed", "no_response"])(
    "accepts %s",
    (reason) => {
      expect(isRushManualClosedReason(reason)).toBe(true);
    },
  );

  it.each([
    "accepted_elsewhere",
    "withdrew",
    "deleted_info",
    "",
    undefined,
    null,
    3,
  ])("refuses %s", (reason) => {
    expect(isRushManualClosedReason(reason)).toBe(false);
  });
});
