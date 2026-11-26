import { describe, expect, it } from "vitest";
import { everyoneOffered } from "./everyones-tasks";

const ME = "me";
const own = { assignee_id: ME, followed_by: null };
const followed = { assignee_id: "cole", followed_by: "role:rush" };
const someoneElses = { assignee_id: "cole", followed_by: null };

describe("everyoneOffered (#5948)", () => {
  const base = { canManage: false, permissionsKnown: true, viewerId: ME };

  it("offers Everyone's to a tasks:manage holder, whatever their read holds", () => {
    expect(everyoneOffered({ ...base, canManage: true, tasks: [] })).toBe(true);
  });

  it("offers it to a member who follows someone else's task (#5473)", () => {
    expect(everyoneOffered({ ...base, tasks: [own, followed] })).toBe(true);
    expect(everyoneOffered({ ...base, tasks: [followed] })).toBe(true);
  });

  it("offers nothing to a member with only their own", () => {
    expect(everyoneOffered({ ...base, tasks: [own] })).toBe(false);
    expect(everyoneOffered({ ...base, tasks: [] })).toBe(false);
  });

  it("keeps a role preview, whose read is the officer's, from reading as a follower's", () => {
    expect(
      everyoneOffered({ ...base, tasks: [own, followed, someoneElses] }),
    ).toBe(false);
  });

  it("offers nothing while permissions or the viewer are unknown", () => {
    expect(
      everyoneOffered({ ...base, permissionsKnown: false, tasks: [followed] }),
    ).toBe(false);
    expect(everyoneOffered({ ...base, viewerId: "", tasks: [followed] })).toBe(
      false,
    );
  });
});
