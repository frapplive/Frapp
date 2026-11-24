import { describe, expect, it } from "vitest";
import { councilTypeLabel, tenantIdentityOf } from "./use-tenant-kind";

/** The tenant's kind, which gates a council's shell (#5933). */
describe("tenantIdentityOf", () => {
  it("is unknown with no active tenant or before the read answers", () => {
    expect(tenantIdentityOf(null, { kind: "council" })).toEqual({
      kind: undefined,
      councilType: null,
    });
    expect(tenantIdentityOf("t-1", undefined)).toEqual({
      kind: undefined,
      councilType: null,
    });
  });

  it("reads a council and its type", () => {
    expect(
      tenantIdentityOf("t-1", { kind: "council", council_type: "nphc" }),
    ).toEqual({ kind: "council", councilType: "nphc" });
  });

  it("reads a payload without a kind as a chapter, and drops a stray type", () => {
    expect(tenantIdentityOf("t-1", {})).toEqual({
      kind: "chapter",
      councilType: null,
    });
    expect(
      tenantIdentityOf("t-1", { kind: "chapter", council_type: "ifc" }),
    ).toEqual({ kind: "chapter", councilType: null });
  });
});

describe("councilTypeLabel", () => {
  it("names each type by its profile, and nothing else", () => {
    expect(councilTypeLabel("ifc")).toBe("Interfraternity Council");
    expect(councilTypeLabel("other")).toBe("Another council");
    expect(councilTypeLabel(null)).toBeNull();
    expect(councilTypeLabel("chapter")).toBeNull();
  });
});
