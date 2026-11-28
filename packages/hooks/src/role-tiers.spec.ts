import { describe, expect, it } from "vitest";
import {
  addsTiers,
  refusesTierMove,
  shownPermissionCount,
  type Reach,
} from "./role-tiers";

describe("shownPermissionCount (#5728)", () => {
  it("counts what the holder's page shows as on: no wildcard, nothing hidden", () => {
    const hidden = (permission: string) => permission === "announcements:post";
    expect(
      shownPermissionCount(
        ["*", "events:create", "announcements:post", "tasks:manage"],
        hidden,
      ),
    ).toBe(2);
  });

  it("counts a repeated string once", () => {
    expect(
      shownPermissionCount(["events:create", "events:create"], () => false),
    ).toBe(1);
  });
});

describe("addsTiers", () => {
  const reach = (extra: Partial<Reach>): Reach => ({
    wildcard: false,
    known: true,
    rank: 1,
    held: new Set<string>(),
    ...extra,
  });
  it("lets a caller with a tier or `*` add one, once their roles are read", () => {
    expect(addsTiers(reach({}))).toBe(true);
    expect(addsTiers(reach({ wildcard: true, rank: 0 }))).toBe(true);
    expect(addsTiers(reach({ known: false }))).toBe(false);
  });
  it("refuses a caller with no tier of their own, as the API does", () => {
    expect(addsTiers(reach({ rank: Number.POSITIVE_INFINITY }))).toBe(false);
  });
});

describe("refusesTierMove (#6033)", () => {
  const tier = { id: "t1", permissions: ["members:view"] };
  const role = { system_key: null, permission_overrides: {} };

  it("refuses any tier for a role marked Non-chapter business", () => {
    expect(refusesTierMove(role, tier, true)).toBe(true);
    expect(refusesTierMove(role, { id: "t2", permissions: [] }, true)).toBe(
      true,
    );
  });

  it("holds nothing while the role isn't marked", () => {
    expect(refusesTierMove(role, tier, false)).toBe(false);
  });
});
