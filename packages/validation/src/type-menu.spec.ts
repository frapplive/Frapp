import { describe, expect, it } from "vitest";
import { documentTypeKey } from "./field-limits";
import {
  addTypeLabel,
  editTypeLabel,
  typeMatchesSearch,
  typeToAdd,
} from "./type-menu";

const limits = { max: 30, maxLength: 60 };

describe("typeToAdd", () => {
  const types = [{ name: "Chapter meeting" }, { name: "Social" }];

  it("offers the typed name, tidied, when no type is called that", () => {
    expect(typeToAdd("  Work   party ", types, limits)).toBe("Work party");
  });

  it("offers nothing for a blank field or a name a type already has", () => {
    expect(typeToAdd("   ", types, limits)).toBeNull();
    expect(typeToAdd("social", types, limits)).toBeNull();
    expect(typeToAdd(" CHAPTER MEETING ", types, limits)).toBeNull();
  });

  it("offers nothing past the name limit or the list's limit", () => {
    expect(typeToAdd("x".repeat(61), types, limits)).toBeNull();
    const full = Array.from({ length: 30 }, (_, i) => ({ name: `Type ${i}` }));
    expect(typeToAdd("Work party", full, limits)).toBeNull();
  });

  it("matches by the caller's key, as document types match by letters and digits", () => {
    const docs = [{ name: "Bylaws" }];
    const docLimits = { ...limits, keyOf: documentTypeKey };
    expect(typeToAdd("By-Laws", docs, docLimits)).toBeNull();
    expect(typeToAdd("---", docs, docLimits)).toBeNull();
    expect(typeToAdd("Accreditation", docs, docLimits)).toBe("Accreditation");
  });
});

describe("the Type menu's words", () => {
  it("names the create row and the edit button from the type", () => {
    expect(addTypeLabel("Work party")).toBe("Create “Work party”");
    expect(editTypeLabel("Budget")).toBe("Edit Budget");
  });

  it("finds a type by any part of its name, ignoring case", () => {
    expect(typeMatchesSearch("Chapter meeting", "MEET")).toBe(true);
    expect(typeMatchesSearch("Social", "  ")).toBe(true);
    expect(typeMatchesSearch("Social", "form")).toBe(false);
  });
});
