import { describe, expect, it } from "vitest";
import {
  DEFAULT_RUSH_STAGES,
  RUSH_CONTACT_KINDS,
  RUSH_STAGE_LABEL_MAX,
  RUSH_STAGES_MAX,
  firstVisibleRushStage,
  formatRushDay,
  formatRushRatingAverage,
  isRushCandidateStale,
  isRushContactKind,
  isRushFollowUpDue,
  isRushFollowUpForViewer,
  isRushManualClosedReason,
  rushDaysBetween,
  rushFollowUpsDueCount,
  rushStaleOn,
  shiftRushDayKey,
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

describe("contacts, follow-ups and the stale alert (#5934)", () => {
  const open = {
    closed_reason: null,
    bid_state: "none",
    created_at: "2026-11-10T22:00:00Z",
    last_contact_on: null as string | null,
    follow_up_on: null as string | null,
    owner_id: null as string | null,
    follow_up_user_id: null as string | null,
  };

  it("goes stale N days after the last contact, or after being added", () => {
    expect(rushStaleOn(open, 7)).toBe("2026-11-17");
    expect(rushStaleOn({ ...open, last_contact_on: "2026-11-20" }, 7)).toBe(
      "2026-11-27",
    );
    expect(isRushCandidateStale(open, 7, "2026-11-16")).toBe(false);
    expect(isRushCandidateStale(open, 7, "2026-11-17")).toBe(true);
    expect(
      isRushCandidateStale(
        { ...open, closed_reason: "no_response" },
        7,
        "2027-01-01",
      ),
    ).toBe(false);
  });

  it("counts a follow-up due today or past, on an open prospect", () => {
    const due = { ...open, follow_up_on: "2026-11-24" };
    expect(isRushFollowUpDue(due, "2026-11-23")).toBe(false);
    expect(isRushFollowUpDue(due, "2026-11-24")).toBe(true);
    expect(isRushFollowUpDue(due, "2026-11-30")).toBe(true);
    expect(
      isRushFollowUpDue({ ...due, closed_reason: "withdrew" }, "2026-11-30"),
    ).toBe(false);
  });

  it("treats an accepted prospect as closed: never stale, no follow-up due (#5973)", () => {
    const accepted = {
      ...open,
      bid_state: "accepted",
      follow_up_on: "2026-11-24",
    };
    expect(rushStaleOn(accepted, 7)).toBeNull();
    expect(isRushFollowUpDue(accepted, "2026-11-30")).toBe(false);
    expect(
      isRushFollowUpDue({ ...accepted, bid_state: "extended" }, "2026-11-30"),
    ).toBe(true);
  });

  it("puts the viewer's due follow-ups and stale prospects they own under Follow up", () => {
    const today = "2026-11-24";
    const mine = { ...open, follow_up_on: today, follow_up_user_id: "me" };
    expect(isRushFollowUpForViewer(mine, "me", 7, today)).toBe(true);
    expect(isRushFollowUpForViewer(mine, "you", 7, today)).toBe(false);
    const owned = { ...open, owner_id: "me", last_contact_on: "2026-11-10" };
    expect(isRushFollowUpForViewer(owned, "me", 7, today)).toBe(true);
    expect(
      isRushFollowUpForViewer(
        { ...owned, last_contact_on: "2026-11-20" },
        "me",
        7,
        today,
      ),
    ).toBe(false);
  });

  it("says a day relative to today, written out", () => {
    const today = "2026-11-24"; // a Tuesday
    expect(formatRushDay("2026-11-24", today)).toBe("Today");
    expect(formatRushDay("2026-11-23", today)).toBe("Yesterday");
    expect(formatRushDay("2026-11-25", today)).toBe("Tomorrow");
    expect(formatRushDay("2026-11-26", today)).toBe("Thursday");
    expect(formatRushDay("2026-11-19", today)).toBe("November 19");
    expect(formatRushDay("2026-11-03", today)).toBe("November 3");
    expect(formatRushDay("2027-01-04", today)).toBe("January 4, 2027");
    expect(shiftRushDayKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(rushDaysBetween("2026-11-24", "2026-12-01")).toBe(7);
  });

  it("counts the viewer's follow-ups due today or earlier", () => {
    const today = "2026-11-24";
    const row = (on: string | null, who: string | null, closed = false) => ({
      closed_reason: closed ? ("withdrew" as const) : null,
      follow_up_on: on,
      follow_up_user_id: who,
    });
    expect(
      rushFollowUpsDueCount(
        [
          row("2026-11-24", "me"),
          row("2026-11-20", "me"),
          row("2026-11-25", "me"),
          row("2026-11-24", "you"),
          row("2026-11-24", "me", true),
          row(null, "me"),
        ],
        "me",
        today,
      ),
    ).toBe(2);
  });

  it("knows the contact kinds", () => {
    expect(RUSH_CONTACT_KINDS).toHaveLength(6);
    expect(isRushContactKind("social_dm")).toBe(true);
    expect(isRushContactKind("pigeon")).toBe(false);
  });
});
