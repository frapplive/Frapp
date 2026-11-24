import { describe, expect, it } from "vitest";
import {
  COUNCIL_PROFILES,
  COUNCIL_TYPES,
  councilPackKeys,
  defaultCouncilName,
  defaultRecruitmentModel,
  isCouncilType,
  keysForRecruitmentModel,
  pickableCouncilTitles,
} from "./council";
import {
  COUNCIL_SHARED_PERMISSIONS,
  permissionDefinition,
} from "./permission-registry";

describe("council profiles", () => {
  it.each(COUNCIL_TYPES)(
    "%s seeds one Council admin, one MEMBER floor and one Everyone",
    (type) => {
      const { roles, tiers } = COUNCIL_PROFILES[type];
      const keys = roles.map((role) => role.systemKey);
      expect(keys.filter((key) => key === "PRESIDENT")).toHaveLength(1);
      expect(keys.filter((key) => key === "MEMBER")).toHaveLength(1);
      expect(keys.filter((key) => key === "EVERYONE")).toHaveLength(1);
      // The admin holds the wildcard; no other seeded role does.
      for (const role of roles) {
        expect(role.extraPermissions.includes("*")).toBe(
          role.systemKey === "PRESIDENT",
        );
        if (role.tier !== null) expect(tiers[role.tier]).toBeDefined();
      }
      // Every tier carries the member floor (`rbac.md` § Role Lifecycle).
      for (const tier of tiers) {
        expect(tier.permissions).toContain("members:view");
      }
    },
  );

  it.each(COUNCIL_TYPES)(
    "%s seeds only council keys and the chapter keys a council shares",
    (type) => {
      for (const key of councilPackKeys(type)) {
        const known = permissionDefinition(key);
        expect(
          known?.scope === "council" || COUNCIL_SHARED_PERMISSIONS.has(key),
        ).toBe(true);
      }
    },
  );

  it("drops every council-recruitment key under the none model", () => {
    const board = COUNCIL_PROFILES.ifc.tiers[0]!.permissions;
    expect(board).toContain("council:recruitment_view");
    const none = keysForRecruitmentModel(board, "none");
    expect(none).not.toContain("council:recruitment_view");
    expect(none).toContain("council:announce");
    expect(keysForRecruitmentModel(board, "open_bidding")).toEqual([...board]);
  });

  it("defaults each type to the model council-types.md gives it", () => {
    expect(defaultRecruitmentModel("ifc")).toBe("open_bidding");
    expect(defaultRecruitmentModel("panhellenic")).toBe("formal");
    expect(defaultRecruitmentModel("nphc")).toBe("none");
    expect(defaultRecruitmentModel("mgc")).toBe("none");
    expect(defaultRecruitmentModel("other")).toBe("none");
  });

  it("offers titles, never the Council admin or Everyone", () => {
    expect(pickableCouncilTitles("ifc").map((t) => t.name)).toEqual([
      "President",
      "VP Recruitment",
      "VP Judicial",
      "Treasurer",
      "Secretary",
      "Delegate",
    ]);
  });

  it("names a council from its school and type", () => {
    expect(defaultCouncilName("ifc", "RPI")).toBe("RPI IFC");
    expect(isCouncilType("ifc")).toBe(true);
    expect(isCouncilType("council")).toBe(false);
  });
});
