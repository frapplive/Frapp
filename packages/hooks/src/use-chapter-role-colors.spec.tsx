import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  roles: undefined as unknown,
  groups: undefined as unknown,
}));

vi.mock("./use-roles", () => ({
  useRoles: () => ({ data: h.roles }),
}));
vi.mock("./use-groups", () => ({
  useGroups: () => ({ data: h.groups }),
}));

import { useChapterRoleColors } from "./use-chapter-role-colors";

describe("useChapterRoleColors (#5966)", () => {
  it("offers the custom colors of both roles and groups, most used first", () => {
    h.roles = [
      { id: "r1", name: "Rush", color: "#4ADE80", permissions: [] },
      { id: "r2", name: "Social", color: "#F2994A", permissions: [] },
    ];
    h.groups = [
      { id: "g1", name: "Intramurals", color: "#10B981" },
      { id: "g2", name: "House", color: "#10b981" },
      { id: "g3", name: "Study", color: null },
    ];
    const { result } = renderHook(() => useChapterRoleColors());
    // #F2994A is a grid swatch already, so it isn't offered twice.
    expect(result.current).toEqual(["#10B981", "#4ADE80"]);
  });

  it("offers nothing while neither read has landed", () => {
    h.roles = undefined;
    h.groups = undefined;
    const { result } = renderHook(() => useChapterRoleColors());
    expect(result.current).toEqual([]);
  });
});
