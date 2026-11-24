import { describe, expect, it } from "vitest";
import {
  isReservedTenantSlug,
  isTenantKind,
  RESERVED_TENANT_SLUGS,
  TENANT_SLUG_PATTERN,
  tenantSlugSchema,
} from "./index";

describe("TENANT_SLUG_PATTERN", () => {
  it.each([
    "fiji-rpi",
    "rpi-ifc",
    "abc",
    "phigam-alpha-chi",
    "a1b",
    "x".repeat(40),
  ])("accepts %s", (slug) => {
    expect(TENANT_SLUG_PATTERN.test(slug)).toBe(true);
  });

  it.each([
    "ab",
    "x".repeat(41),
    "-abc",
    "abc-",
    "ab--cd",
    "Fiji-rpi",
    "fiji_rpi",
    "fíji-rpi",
    "fiji rpi",
  ])("refuses %s", (slug) => {
    expect(TENANT_SLUG_PATTERN.test(slug)).toBe(false);
  });
});

describe("reserved slugs", () => {
  it("reserves a council word alone but not inside a slug", () => {
    expect(isReservedTenantSlug("ifc")).toBe(true);
    expect(isReservedTenantSlug("rpi-ifc")).toBe(false);
  });

  it("holds no duplicates", () => {
    expect(new Set(RESERVED_TENANT_SLUGS).size).toBe(
      RESERVED_TENANT_SLUGS.length,
    );
  });

  it("refuses a reserved word through the schema", () => {
    expect(tenantSlugSchema.safeParse("chat").success).toBe(false);
    expect(tenantSlugSchema.safeParse("fiji-rpi").success).toBe(true);
  });
});

describe("isTenantKind", () => {
  it("knows chapter and council only", () => {
    expect(isTenantKind("chapter")).toBe(true);
    expect(isTenantKind("council")).toBe(true);
    expect(isTenantKind("ifc")).toBe(false);
    expect(isTenantKind(undefined)).toBe(false);
  });
});
