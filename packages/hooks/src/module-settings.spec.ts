import { describe, expect, it } from "vitest";
import {
  ONLY_THE_PRESIDENT,
  countSummary,
  goalMetricOfPage,
  goalPageId,
  goalPerUnit,
  goalSummary,
  goalToStored,
  goalToTyped,
  goalTypedMax,
  modulePermissions,
  moduleScreenTitle,
  permissionOfWhoCanPage,
  whoCanHolders,
  whoCanPageId,
  whoCanSummary,
} from "./module-settings";
import type { TierRow, TieredRole } from "./role-tiers";

const tier = (id: string, name: string, permissions: string[]): TierRow => ({
  id,
  name,
  position: 1,
  permissions,
  mentionable: true,
});
const role = (
  id: string,
  name: string,
  permissions: string[],
  tierId: string | null,
): TieredRole => ({
  id,
  name,
  color: null,
  permissions,
  is_system: false,
  system_key: null,
  display_order: 1,
  mentionable: true,
  tier_id: tierId,
  permission_overrides: {},
  self_assignable: false,
});

const tierHas = (t: TierRow, p: string) => t.permissions.includes(p);
const roleHas = (r: TieredRole, p: string) => r.permissions.includes(p);

/** A module page's rows (#6030), the same words on web and the phone. */
describe("module settings rows", () => {
  it("round-trips a permission through its Who can page id", () => {
    expect(whoCanPageId("events:create")).toBe("can-events:create");
    expect(permissionOfWhoCanPage("can-events:create")).toBe("events:create");
    expect(permissionOfWhoCanPage("goal-points")).toBeNull();
    expect(permissionOfWhoCanPage("can-")).toBeNull();
    expect(permissionOfWhoCanPage(null)).toBeNull();
  });

  it("answers with the tiers, then only the roles their tier doesn't cover", () => {
    const tiers = [
      tier("exec", "Exec board", ["events:create"]),
      tier("members", "Members", []),
    ];
    const roles = [
      role("vp", "Vice President", ["events:create"], "exec"),
      role("social", "Social chair", ["events:create"], "members"),
      role("alumni", "Alumni", ["events:create"], null),
      role("member", "Member", [], "members"),
    ];
    const holders = whoCanHolders(
      "events:create",
      tiers,
      roles,
      tierHas,
      roleHas,
    );
    expect(holders.tiers.map((t) => t.name)).toEqual(["Exec board"]);
    expect(holders.roles.map((r) => r.name)).toEqual([
      "Social chair",
      "Alumni",
    ]);
  });

  it("names two holders and counts the rest", () => {
    expect(whoCanSummary([])).toBe(ONLY_THE_PRESIDENT);
    expect(whoCanSummary(["Exec board"])).toBe("Exec board");
    expect(whoCanSummary(["Exec board", "Officers"])).toBe(
      "Exec board, Officers",
    );
    expect(
      whoCanSummary(["Exec board", "Officers", "Members", "Pledges"]),
    ).toBe("Exec board, Officers and 2 more");
  });

  it("says a goal in the unit it's typed in, and how many roles differ", () => {
    expect(goalSummary("points", undefined)).toBe("No goal");
    expect(goalSummary("points", { everyone: null, roles: [] })).toBe(
      "No goal",
    );
    expect(goalSummary("points", { everyone: 1, roles: [] })).toBe("1 point");
    expect(goalSummary("points", { everyone: 1200, roles: [{}] })).toBe(
      "1,200 points, 1 role differs",
    );
    expect(goalSummary("service", { everyone: 1200, roles: [{}, {}] })).toBe(
      "20 hours, 2 roles differ",
    );
    expect(goalSummary("study", { everyone: 240, roles: [] })).toBe(
      "4 hours a week",
    );
    expect(goalSummary("study", { everyone: 60, roles: [] })).toBe(
      "1 hour a week",
    );
  });

  it("counts a list, or says None", () => {
    expect(countSummary(0, "tag", "tags")).toBe("None");
    expect(countSummary(1, "tag", "tags")).toBe("1 tag");
    expect(countSummary(6, "stage", "stages")).toBe("6 stages");
  });
});

describe("modulePermissions", () => {
  it("lists a module's permissions from the registry", () => {
    expect(
      modulePermissions("events").map((entry) => entry.permission),
    ).toEqual(["events:create", "events:update", "events:delete"]);
  });

  it("leaves out the retired permissions, as the Roles page does (#5728)", () => {
    expect(modulePermissions("announcements")).toEqual([]);
    expect(
      modulePermissions("chat").map((entry) => entry.permission),
    ).not.toContain("alumni:post");
  });
});

describe("goal pages (#6030)", () => {
  it("names a measure's page and reads it back", () => {
    expect(goalPageId("service")).toBe("goal-service");
    expect(goalMetricOfPage("goal-study")).toBe("study");
    expect(goalMetricOfPage("goal-nope")).toBeNull();
    expect(goalMetricOfPage("can-points:adjust")).toBeNull();
  });

  it("types points as points and hours as minutes", () => {
    expect(goalPerUnit("points")).toBe(1);
    expect(goalPerUnit("service")).toBe(60);
  });
});

describe("goal arithmetic and module screen titles (#6030)", () => {
  it("never reads an inherited key as a goal page", () => {
    expect(goalMetricOfPage("goal-toString")).toBeNull();
    expect(goalMetricOfPage("goal-constructor")).toBeNull();
  });

  it("types hours as whole hours and stores them as minutes", () => {
    expect(goalToTyped("service", 1230)).toBe(21);
    expect(goalToStored("service", 21)).toBe(1260);
    expect(goalToTyped("points", null)).toBeNull();
    expect(goalTypedMax("points")).toBeGreaterThan(goalTypedMax("study"));
  });

  it("titles a module's screen and each of its own screens", () => {
    expect(moduleScreenTitle("points")).toBe("Points");
    expect(moduleScreenTitle("points", "goal-points")).toBe("Points goal");
    expect(moduleScreenTitle("points", "goal-service")).toBe("Points");
    expect(moduleScreenTitle("meetings", "sections")).toBe(
      "Sections in the minutes",
    );
    expect(moduleScreenTitle("rush", "question-q1")).toBe("Question");
    expect(moduleScreenTitle("rush", "nowhere")).toBe("Recruitment");
    expect(moduleScreenTitle("dues")).toBeNull();
    expect(moduleScreenTitle("nope")).toBeNull();
  });
});
