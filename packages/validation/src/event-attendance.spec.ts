import { describe, expect, it } from "vitest";
import {
  attendanceEntryName,
  attendanceFieldsOf,
  attendanceFloorOf,
  withRole,
  attendanceFromEvent,
  attendanceInvitesNobody,
  attendanceTierEntry,
  attendanceTierIdOf,
  splitAttendancePicks,
  attendanceToWire,
  attendanceChoices,
  attendanceOfRole,
  attendanceRows,
  describeAttendance,
  eventAttendanceFor,
  eventLimitsAudience,
  eventInvitedRoleNames,
  eventOthersInvited,
  othersInvitedForCreate,
  eventRequiresAnyone,
  attendanceAnswerChoices,
  emptyAttendanceDraft,
  everyoneAnswer,
  roleAnswer,
  withEveryoneAnswer,
  withRoleAnswer,
} from "./event-attendance";

describe("eventAttendanceFor", () => {
  it("reads a row written before the new columns as before", () => {
    expect(eventAttendanceFor({ is_mandatory: true }, ["r"])).toEqual({
      status: "required",
      byRole: false,
    });
    expect(eventAttendanceFor({ is_mandatory: false }, [])).toEqual({
      status: "optional",
      byRole: false,
    });
  });

  it("keeps an older targeted row to its roles once migrated", () => {
    const event = { required_role_ids: ["exec"], others_invited: false };
    expect(eventAttendanceFor(event, ["exec"]).status).toBe("required");
    expect(eventAttendanceFor(event, ["member"]).status).toBe("not_invited");
  });

  it("gives a member with several listed roles the strongest", () => {
    const event = {
      required_role_ids: ["officer"],
      optional_role_ids: ["member"],
      excluded_role_ids: ["new"],
      others_invited: false,
    };
    expect(eventAttendanceFor(event, ["new", "officer"]).status).toBe(
      "required",
    );
    expect(eventAttendanceFor(event, ["new", "member"]).status).toBe(
      "optional",
    );
    expect(eventAttendanceFor(event, ["new"])).toEqual({
      status: "not_invited",
      byRole: true,
    });
    expect(eventAttendanceFor(event, ["alumni"])).toEqual({
      status: "not_invited",
      byRole: false,
    });
  });

  it("lets a listed role beat the default either way", () => {
    const event = {
      is_mandatory: true,
      optional_role_ids: ["alumni"],
      others_invited: true,
    };
    expect(eventAttendanceFor(event, ["alumni"]).status).toBe("optional");
    expect(eventAttendanceFor(event, ["member"]).status).toBe("required");
  });
});

describe("eventLimitsAudience / eventRequiresAnyone", () => {
  it("only limits the audience when someone is left out", () => {
    // A row without `others_invited` reads with the older meaning: a
    // non-empty required list was the whole audience.
    expect(eventLimitsAudience({ required_role_ids: ["x"] })).toBe(true);
    expect(
      eventLimitsAudience({ required_role_ids: ["x"], others_invited: true }),
    ).toBe(false);
    expect(eventLimitsAudience({ required_role_ids: [] })).toBe(false);
    expect(eventLimitsAudience({ others_invited: false })).toBe(true);
    expect(eventLimitsAudience({ excluded_role_ids: ["x"] })).toBe(true);
  });

  it("ignores is_mandatory when nobody else is invited", () => {
    expect(
      eventRequiresAnyone({ is_mandatory: true, others_invited: false }),
    ).toBe(false);
    expect(eventRequiresAnyone({ required_role_ids: ["x"] })).toBe(true);
    expect(eventRequiresAnyone({ is_mandatory: true })).toBe(true);
  });
});

describe("attendanceToWire / attendanceFromEvent", () => {
  it("round-trips a mixed rule and drops roles equal to the default", () => {
    const wire = attendanceToWire({
      everyone: "optional",
      roles: { officer: "required", member: "optional", new: "not_invited" },
    });
    expect(wire).toEqual({
      is_mandatory: false,
      others_invited: true,
      required_role_ids: ["officer"],
      optional_role_ids: [],
      excluded_role_ids: ["new"],
    });
    expect(attendanceFromEvent(wire)).toEqual({
      everyone: "optional",
      roles: { officer: "required", new: "not_invited" },
    });
  });

  it("reads an older targeted row as officers-only", () => {
    expect(
      attendanceFromEvent({
        is_mandatory: true,
        required_role_ids: ["exec"],
        others_invited: false,
      }),
    ).toEqual({ everyone: "not_invited", roles: { exec: "required" } });
  });
});

describe("describeAttendance", () => {
  const names: Record<string, string> = {
    exec: "Executive Board",
    new: "New Members",
    a: "A",
    b: "B",
    c: "C",
  };
  const name = (id: string) => names[id];

  it("says the default alone when no role differs", () => {
    expect(describeAttendance({ everyone: "required", roles: {} }, name)).toBe(
      "Required for everyone",
    );
  });

  it("names the roles set apart, then the default", () => {
    expect(
      describeAttendance(
        { everyone: "required", roles: { new: "not_invited" } },
        name,
      ),
    ).toBe("New Members not invited, everyone else required");
  });

  it("groups by answer, required first, and shortens past two", () => {
    expect(
      describeAttendance(
        {
          everyone: "optional",
          roles: {
            c: "required",
            a: "required",
            b: "required",
            new: "not_invited",
          },
        },
        name,
      ),
    ).toBe("A, B +1 required, New Members not invited, everyone else optional");
  });

  it("says nobody else is invited for an invite-only audience", () => {
    expect(
      describeAttendance(
        {
          everyone: "not_invited",
          roles: { exec: "required", new: "optional" },
        },
        name,
      ),
    ).toBe(
      "Executive Board required, New Members optional, nobody else invited",
    );
  });

  it("says nobody is invited yet when nothing is", () => {
    expect(
      describeAttendance({ everyone: "not_invited", roles: {} }, name),
    ).toBe("Nobody invited yet");
  });
});

describe("attendanceRows", () => {
  const roles = [
    { id: "b", name: "Brothers" },
    { id: "a", name: "Alumni" },
    { id: "o", name: "Officers" },
    { id: "n", name: "New Members" },
  ];

  it("puts the roles set apart first, then the rest, each by name", () => {
    expect(
      attendanceRows(roles, ["o", "a"], "", "Removed role").map((r) => r.id),
    ).toEqual(["a", "o", "b", "n"]);
  });

  it("keeps a row for a role deleted since, so it can be reset", () => {
    expect(attendanceRows(roles, ["gone"], "", "Removed role")[0]).toEqual({
      id: "gone",
      name: "Removed role",
    });
  });

  it("matches every typed word", () => {
    expect(
      attendanceRows(roles, [], "new mem", "Removed role").map((r) => r.id),
    ).toEqual(["n"]);
  });

  it("offers a hidden role (Everyone, #4191) only once it is set apart", () => {
    const withEveryone = [
      ...roles,
      { id: "e", name: "Everyone", hidden: true },
    ];
    expect(
      attendanceRows(withEveryone, [], "", "Removed role").map((r) => r.id),
    ).toEqual(["a", "b", "n", "o"]);
    expect(
      attendanceRows(withEveryone, ["e"], "", "Removed role").map((r) => r.id),
    ).toEqual(["e", "a", "b", "n", "o"]);
  });
});

describe("attendanceChoices", () => {
  it("drops Required unless allowed or already held", () => {
    expect(attendanceChoices("optional", true)).toEqual([
      "required",
      "optional",
      "not_invited",
    ]);
    expect(attendanceChoices("optional", false)).toEqual([
      "optional",
      "not_invited",
    ]);
    expect(attendanceChoices("required", false)).toEqual([
      "required",
      "optional",
      "not_invited",
    ]);
  });
});

describe("attendanceOfRole", () => {
  it("reads a role's own answer, else the default", () => {
    const draft = {
      everyone: "optional" as const,
      roles: { o: "required" as const },
    };
    expect(attendanceOfRole(draft, "o")).toBe("required");
    expect(attendanceOfRole(draft, "b")).toBe("optional");
  });
});

describe("others_invited on a row written without it", () => {
  it("derives it from required_role_ids, the older meaning", () => {
    expect(eventOthersInvited({})).toBe(true);
    expect(eventOthersInvited({ others_invited: null })).toBe(true);
    expect(eventOthersInvited({ required_role_ids: ["o"] })).toBe(false);
    expect(
      eventOthersInvited({ required_role_ids: ["o"], others_invited: true }),
    ).toBe(true);
    expect(
      eventAttendanceFor({ is_mandatory: true, required_role_ids: ["o"] }, [
        "m",
      ]).status,
    ).toBe("not_invited");
  });

  it("is sent on create only when a null would read differently", () => {
    const wire = (others: boolean, required: string[] = []) => ({
      is_mandatory: false,
      others_invited: others,
      required_role_ids: required,
      optional_role_ids: [],
      excluded_role_ids: [],
    });
    expect(othersInvitedForCreate(wire(true))).toBeUndefined();
    expect(othersInvitedForCreate(wire(false, ["o"]))).toBeUndefined();
    expect(othersInvitedForCreate(wire(true, ["o"]))).toBe(true);
    expect(othersInvitedForCreate(wire(false))).toBe(false);
  });

  it("refuses a rule that invites nobody", () => {
    expect(
      attendanceInvitesNobody(
        attendanceToWire({ everyone: "not_invited", roles: {} }),
      ),
    ).toBe(true);
    expect(
      attendanceInvitesNobody(
        attendanceToWire({ everyone: "not_invited", roles: { o: "optional" } }),
      ),
    ).toBe(false);
  });
});

describe("eventInvitedRoleNames (#5562)", () => {
  const roles = [
    { id: "r1", name: "Exec" },
    { id: "r2", name: "Brothers" },
  ];
  it("names the invited roles, required then optional", () => {
    expect(
      eventInvitedRoleNames(
        {
          others_invited: false,
          required_role_ids: ["r1"],
          optional_role_ids: ["r2"],
        },
        roles,
      ),
    ).toBe("Exec, Brothers");
  });
  it("is null when everyone is invited or no listed role is known", () => {
    expect(eventInvitedRoleNames({ others_invited: true }, roles)).toBeNull();
    expect(
      eventInvitedRoleNames(
        { others_invited: false, required_role_ids: ["gone"] },
        roles,
      ),
    ).toBeNull();
  });
});

describe("tiers in Who's coming (Paul, 2026-11-22)", () => {
  const TIER = "11111111-2222-3333-4444-555555555555";
  const cabinet = attendanceTierEntry(TIER);

  it("spells a tier as an entry and reads it back", () => {
    expect(cabinet).toBe(`tier:${TIER}`);
    expect(attendanceTierIdOf(cabinet)).toBe(TIER);
    expect(attendanceTierIdOf("role-1")).toBeNull();
  });

  it("keeps the picks only when a list names a tier", () => {
    expect(
      splitAttendancePicks({
        required_role_ids: ["r1"],
        optional_role_ids: [],
        excluded_role_ids: null,
      }),
    ).toEqual({
      attendance_picks: null,
      required_role_ids: ["r1"],
      optional_role_ids: [],
      excluded_role_ids: null,
    });
    expect(
      splitAttendancePicks({
        required_role_ids: [cabinet, "r1"],
        optional_role_ids: [cabinet],
        excluded_role_ids: null,
      }),
    ).toEqual({
      attendance_picks: {
        required: [cabinet, "r1"],
        optional: [cabinet],
        not_invited: [],
      },
      required_role_ids: ["r1"],
      optional_role_ids: null,
      excluded_role_ids: null,
    });
  });

  it("opens the editor on the picks, not the expanded roles", () => {
    const fields = attendanceFieldsOf({
      others_invited: false,
      required_role_ids: ["r-president", "r-treasurer"],
      attendance_picks: { required: [cabinet], optional: [], not_invited: [] },
    });
    expect(attendanceFromEvent(fields)).toEqual({
      everyone: "not_invited",
      roles: { [cabinet]: "required" },
    });
  });

  it("names a tier in the summary", () => {
    const nameOf = attendanceEntryName(
      [{ id: "r1", name: "Treasurer" }],
      [{ id: TIER.toUpperCase(), name: "Cabinet" }],
    );
    expect(
      describeAttendance(
        { everyone: "not_invited", roles: { [cabinet]: "required" } },
        nameOf,
      ),
    ).toBe("Cabinet required, nobody else invited");
    expect(nameOf("r1")).toBe("Treasurer");
  });

  it("never lets a role off its tier: only answers at or above it", () => {
    const draft = {
      everyone: "optional" as const,
      roles: { [cabinet]: "optional" as const },
    };
    expect(attendanceFloorOf(draft, cabinet)).toBe("optional");
    expect(attendanceChoices("optional", true, "optional")).toEqual([
      "required",
      "optional",
    ]);
    // Raised above the tier, it is set apart; back to the tier's, it follows.
    const raised = withRole(draft, "r1", "required", cabinet);
    expect(raised.roles.r1).toBe("required");
    expect(withRole(raised, "r1", "optional", cabinet).roles).toEqual({
      [cabinet]: "optional",
    });
  });

  it("names a tier invited by its name in the minutes line", () => {
    expect(
      eventInvitedRoleNames(
        {
          others_invited: false,
          required_role_ids: ["r-pres", "r-vp"],
          attendance_picks: {
            required: [cabinet],
            optional: [],
            not_invited: [],
          },
        },
        [{ id: "r-pres", name: "President" }],
        [{ id: TIER, name: "Cabinet" }],
      ),
    ).toBe("Cabinet");
  });

  it("lowercases a tier sent in another case", () => {
    expect(
      splitAttendancePicks({
        required_role_ids: [`TIER:${TIER.toUpperCase()}`],
        optional_role_ids: null,
        excluded_role_ids: null,
      }).attendance_picks?.required,
    ).toEqual([cabinet]);
  });

  it("answers a role that follows its tier as the tier does", () => {
    const draft = {
      everyone: "optional" as const,
      roles: { [cabinet]: "required" as const },
    };
    expect(attendanceOfRole(draft, "r1", cabinet)).toBe("required");
    expect(attendanceOfRole(draft, "r1", null)).toBe("optional");
    expect(
      attendanceOfRole(
        { ...draft, roles: { ...draft.roles, r1: "not_invited" } },
        "r1",
        cabinet,
      ),
    ).toBe("required");
  });

  it("sends a tier through the wire as an entry", () => {
    expect(
      attendanceToWire({
        everyone: "not_invited",
        roles: { [cabinet]: "required" },
      }),
    ).toMatchObject({ others_invited: false, required_role_ids: [cabinet] });
  });
});

describe("On the calendar only (#6098)", () => {
  const base = {
    everyone: "required" as const,
    roles: { exec: "optional" as const, pledges: "not_invited" as const },
  };

  it("is an answer on Everyone else, keeping only the roles left out", () => {
    const draft = withEveryoneAnswer(base, "calendar_only");
    expect(draft).toEqual({
      calendarOnly: true,
      everyone: "optional",
      roles: { pledges: "not_invited" },
    });
    expect(everyoneAnswer(draft)).toBe("calendar_only");
    expect(roleAnswer(draft, "exec")).toBe("calendar_only");
    expect(roleAnswer(draft, "pledges")).toBe("not_invited");
  });

  it("goes out as nobody required and nothing Required or Optional", () => {
    const draft = withEveryoneAnswer(base, "calendar_only");
    expect(attendanceToWire(draft)).toEqual({
      is_mandatory: false,
      others_invited: true,
      required_role_ids: [],
      optional_role_ids: [],
      excluded_role_ids: ["pledges"],
    });
    expect(describeAttendance(draft, (id) => id)).toBe(
      "pledges not invited, everyone else on the calendar only",
    );
    expect(
      describeAttendance(
        withEveryoneAnswer(emptyAttendanceDraft(), "calendar_only"),
        () => undefined,
      ),
    ).toBe("On the calendar only for everyone");
  });

  it("reads back from a stored event", () => {
    expect(
      attendanceFromEvent({
        calendar_only: true,
        others_invited: true,
        excluded_role_ids: ["pledges"],
      }),
    ).toEqual({
      calendarOnly: true,
      everyone: "optional",
      roles: { pledges: "not_invited" },
    });
  });

  it("offers role rows only calendar only or Not invited while it holds", () => {
    const draft = withEveryoneAnswer(base, "calendar_only");
    const options = { allowRequired: true, calendarOnlyAllowed: true };
    expect(
      attendanceAnswerChoices(draft, { kind: "everyone" }, options),
    ).toEqual(["required", "optional", "calendar_only", "not_invited"]);
    expect(
      attendanceAnswerChoices(
        draft,
        { kind: "role", current: "calendar_only" },
        options,
      ),
    ).toEqual(["calendar_only", "not_invited"]);
    expect(
      attendanceAnswerChoices(
        base,
        { kind: "everyone" },
        {
          ...options,
          calendarOnlyAllowed: false,
        },
      ),
    ).toEqual(["required", "optional", "not_invited"]);
  });

  it("offers only Not invited under a tier that is left out", () => {
    const draft = withEveryoneAnswer(
      { everyone: "optional", roles: { "tier:cab": "not_invited" } },
      "calendar_only",
    );
    expect(
      attendanceAnswerChoices(
        draft,
        { kind: "role", current: "not_invited" },
        {
          allowRequired: true,
          calendarOnlyAllowed: true,
          floor: "not_invited",
        },
      ),
    ).toEqual(["not_invited"]);
  });

  it("leaves calendar only for an ordinary answer with the left-out roles kept", () => {
    const draft = withEveryoneAnswer(
      withEveryoneAnswer(base, "calendar_only"),
      "optional",
    );
    expect(draft).toEqual({
      everyone: "optional",
      roles: { pledges: "not_invited" },
    });
    expect(
      withRoleAnswer(
        withEveryoneAnswer(base, "calendar_only"),
        "exec",
        "not_invited",
      ).roles,
    ).toEqual({ pledges: "not_invited", exec: "not_invited" });
  });
});
