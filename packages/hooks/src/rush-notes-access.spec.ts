import { describe, expect, it } from "vitest";
import { RUSH_READ_NOTES, rushNotesAccess } from "./rush-notes-access";
import type { Reach, TierRow, TieredRole } from "./role-tiers";

const tier = (id: string, position: number, permissions: string[] = []) =>
  ({ id, name: id, position, permissions, mentionable: true }) as TierRow;
const president: Reach = {
  wildcard: true,
  rank: 0,
  held: new Set(["*"]),
  known: true,
};

const access = (
  tiers: TierRow[],
  roles: TieredRole[] = [],
  canEditRoles = true,
) =>
  rushNotesAccess({
    tiers,
    roles,
    tierHolds: (each) => each.permissions.includes(RUSH_READ_NOTES),
    reach: president,
    canEditRoles,
    tierPlural: "tiers",
  });

describe("rushNotesAccess (#6030)", () => {
  it("offers the top two tiers when nobody can read notes", () => {
    const result = access([
      tier("Exec", 1),
      tier("Officers", 2),
      tier("Members", 3),
    ]);
    expect(result?.line).toBe("Nobody can read recruitment notes yet.");
    expect(result?.action).toBe("Let the top two tiers read them");
    expect(result?.missing.map((each) => each.id)).toEqual([
      "Exec",
      "Officers",
    ]);
    expect(result?.why).toBeNull();
  });

  it("finishes a grant that half landed", () => {
    const result = access([
      tier("Exec", 1, [RUSH_READ_NOTES]),
      tier("Officers", 2),
    ]);
    expect(result?.line).toBe("Only Exec can read recruitment notes so far.");
    expect(result?.action).toBe("Let Officers read them too");
  });

  it("goes once the chapter chose who reads them", () => {
    expect(
      access([
        tier("Exec", 1),
        tier("Officers", 2),
        tier("Members", 3, [RUSH_READ_NOTES]),
      ]),
    ).toBeNull();
    expect(
      access([
        tier("Exec", 1, [RUSH_READ_NOTES]),
        tier("Officers", 2, [RUSH_READ_NOTES]),
      ]),
    ).toBeNull();
  });

  it("says why the press can't be made", () => {
    expect(access([tier("Exec", 1)], [], false)?.why).toBe(
      "Your role can't change roles.",
    );
    expect(access([])?.why).toBe("Your chapter has no tiers yet.");
  });
});
