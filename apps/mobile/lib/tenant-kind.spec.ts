import { describe, expect, it } from "vitest";
import {
  resolveTenantKind,
  tenantRowBody,
  type TenantMembership,
} from "./tenant-kind";

describe("resolveTenantKind", () => {
  it("reads the open tenant's own answer", () => {
    expect(resolveTenantKind({ current: { kind: "council" } })).toBe("council");
    expect(resolveTenantKind({ current: { kind: "chapter" } })).toBe("chapter");
  });

  it("waits while the read is out", () => {
    expect(resolveTenantKind({ current: undefined })).toBeNull();
    expect(resolveTenantKind({})).toBeNull();
  });

  it("reads an answer from before councils as a chapter", () => {
    expect(resolveTenantKind({ current: {} })).toBe("chapter");
    expect(resolveTenantKind({ current: { kind: null } })).toBe("chapter");
  });

  it("fails open to a chapter when the read failed with nothing cached", () => {
    expect(resolveTenantKind({ currentFailed: true })).toBe("chapter");
  });
});

function membership(
  overrides: Omit<Partial<TenantMembership>, "chapter"> & {
    chapter?: Partial<TenantMembership["chapter"]>;
  },
): TenantMembership {
  return {
    chapter_id: "t",
    member_id: "m",
    role_ids: [],
    has_completed_onboarding: true,
    ...overrides,
    chapter: {
      id: "t",
      name: "Tenant",
      university: "Rensselaer Polytechnic Institute",
      subscription_status: "active",
      past_due_since: null,
      accent_color: null,
      logo_path: null,
      donation_url: null,
      created_at: "",
      updated_at: "",
      ...overrides.chapter,
    },
  } as TenantMembership;
}

describe("tenantRowBody", () => {
  it("is a chapter's school", () => {
    expect(tenantRowBody(membership({ kind: "chapter" }))).toBe(
      "Rensselaer Polytechnic Institute",
    );
  });

  it("names a council's type before its school", () => {
    expect(
      tenantRowBody(
        membership({ kind: "council", chapter: { council_type: "ifc" } }),
      ),
    ).toBe("Interfraternity Council · Rensselaer Polytechnic Institute");
  });

  it("falls back to the school for a type it doesn't know", () => {
    expect(
      tenantRowBody(
        membership({ kind: "council", chapter: { council_type: "pta" } }),
      ),
    ).toBe("Rensselaer Polytechnic Institute");
  });
});
