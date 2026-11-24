import { describe, expect, it } from "vitest";
import {
  COUNCIL_CUSTOM_TITLE_KEY,
  COUNCIL_NAME_MAX,
  COUNCIL_TITLE_MAX,
  COUNCIL_TYPES,
} from "@repo/validation";
import {
  COUNCIL_FORM_COPY,
  EMPTY_COUNCIL_DRAFT,
  councilCreateBody,
  councilDraftComplete,
  councilDraftProblem,
  councilMetaLine,
  councilSteps,
  councilTitleChoices,
  councilTitleValue,
  councilTypeChoices,
  createCouncilLabel,
  withCouncilName,
  withCouncilSchool,
  withCouncilType,
  type CouncilDraft,
} from "./council-form";

const RPI = {
  id: "school-rpi",
  name: "Rensselaer Polytechnic Institute",
  short_name: "RPI",
};

/** A founder at RPI who picked IFC and nothing else yet. */
function ifcDraft(): CouncilDraft {
  return withCouncilType(withCouncilSchool(EMPTY_COUNCIL_DRAFT, RPI), "ifc");
}

describe("councilSteps", () => {
  it("starts with the school check when no school is verified", () => {
    expect(councilSteps(0)).toEqual(["verify", "type", "details"]);
  });

  it("takes one verified school as given", () => {
    expect(councilSteps(1)).toEqual(["type", "details"]);
  });

  it("asks which school when there are several", () => {
    expect(councilSteps(2)).toEqual(["school", "type", "details"]);
  });
});

describe("the type step", () => {
  it("offers all five councils, each with its one line", () => {
    const choices = councilTypeChoices();
    expect(choices.map((choice) => choice.type)).toEqual([...COUNCIL_TYPES]);
    expect(choices[0]).toEqual({
      type: "ifc",
      label: "Interfraternity Council",
      description: "The council of a school's IFC fraternities.",
    });
    for (const choice of choices) expect(choice.description).not.toBe("");
  });
});

describe("the founder's title", () => {
  it("lists the type's seeded titles, then Something else", () => {
    const choices = councilTitleChoices("ifc");
    expect(choices.map((choice) => choice.label)).toEqual([
      "President",
      "VP Recruitment",
      "VP Judicial",
      "Treasurer",
      "Secretary",
      "Delegate",
      COUNCIL_FORM_COPY.somethingElse,
    ]);
    expect(choices.at(-1)?.value).toBe(COUNCIL_CUSTOM_TITLE_KEY);
  });

  it("never offers Council admin or Everyone, which the founder holds or everyone does", () => {
    for (const type of COUNCIL_TYPES) {
      const labels = councilTitleChoices(type).map((choice) => choice.label);
      expect(labels).not.toContain("Council admin");
      expect(labels).not.toContain("Everyone");
    }
  });

  it("reads back the picked title's name", () => {
    const draft = { ...ifcDraft(), titleKey: "vp_recruitment" };
    expect(councilTitleValue(draft)).toBe("VP Recruitment");
    expect(councilTitleValue(ifcDraft())).toBeNull();
  });
});

describe("the offered name", () => {
  it("is the school's short name and the type's", () => {
    expect(ifcDraft().name).toBe("RPI IFC");
    expect(withCouncilType(ifcDraft(), "panhellenic").name).toBe(
      "RPI Panhellenic",
    );
  });

  it("stops following the type once the founder types one", () => {
    const typed = withCouncilName(ifcDraft(), "Rensselaer IFC");
    expect(withCouncilType(typed, "mgc").name).toBe("Rensselaer IFC");
  });

  it("follows a school picked after the type", () => {
    const draft = withCouncilType(EMPTY_COUNCIL_DRAFT, "nphc");
    expect(withCouncilSchool(draft, RPI).name).toBe("RPI NPHC");
  });
});

describe("changing the type", () => {
  it("drops a title the new type doesn't seed", () => {
    const vpFinance = {
      ...withCouncilType(
        withCouncilSchool(EMPTY_COUNCIL_DRAFT, RPI),
        "panhellenic",
      ),
      titleKey: "vp_finance",
    };
    expect(withCouncilType(vpFinance, "ifc").titleKey).toBeNull();
  });

  it("keeps a title both types seed, and a title of the founder's own", () => {
    const president = { ...ifcDraft(), titleKey: "president" };
    expect(withCouncilType(president, "mgc").titleKey).toBe("president");
    const own = {
      ...ifcDraft(),
      titleKey: COUNCIL_CUSTOM_TITLE_KEY,
      customTitle: "Recruitment Chair",
    };
    expect(withCouncilType(own, "nphc")).toMatchObject({
      titleKey: COUNCIL_CUSTOM_TITLE_KEY,
      customTitle: "Recruitment Chair",
    });
  });
});

describe("submitting", () => {
  it("isn't complete without a title", () => {
    expect(councilDraftComplete(ifcDraft())).toBe(false);
    expect(councilDraftComplete({ ...ifcDraft(), titleKey: "president" })).toBe(
      true,
    );
  });

  it("needs the typed title when the founder picked Something else", () => {
    const custom = { ...ifcDraft(), titleKey: COUNCIL_CUSTOM_TITLE_KEY };
    expect(councilDraftComplete(custom)).toBe(false);
    expect(councilDraftProblem(custom)).toBe(
      COUNCIL_FORM_COPY.customTitleMissing,
    );
  });

  it("says what's wrong in words, within the API's limits", () => {
    expect(councilDraftProblem({ ...ifcDraft(), name: "  " })).toBe(
      COUNCIL_FORM_COPY.nameMissing,
    );
    expect(
      councilDraftProblem({
        ...ifcDraft(),
        titleKey: "president",
        name: "x".repeat(COUNCIL_NAME_MAX + 1),
      }),
    ).toBe(COUNCIL_FORM_COPY.nameTooLong);
    expect(
      councilDraftProblem({
        ...ifcDraft(),
        titleKey: COUNCIL_CUSTOM_TITLE_KEY,
        customTitle: "x".repeat(COUNCIL_TITLE_MAX + 1),
      }),
    ).toBe(COUNCIL_FORM_COPY.customTitleTooLong);
    expect(councilDraftProblem({ ...ifcDraft(), titleKey: null })).toBe(
      COUNCIL_FORM_COPY.titleMissing,
    );
  });

  it("sends a seeded title by its key, with the Terms accepted", () => {
    expect(
      councilCreateBody({ ...ifcDraft(), titleKey: "vp_recruitment" }),
    ).toEqual({
      school_id: "school-rpi",
      council_type: "ifc",
      name: "RPI IFC",
      title_key: "vp_recruitment",
      accept_terms_privacy: true,
    });
  });

  it("sends a title of the founder's own, trimmed", () => {
    expect(
      councilCreateBody({
        ...withCouncilName(ifcDraft(), "  Rensselaer IFC "),
        titleKey: COUNCIL_CUSTOM_TITLE_KEY,
        customTitle: " Recruitment Chair ",
      }),
    ).toEqual({
      school_id: "school-rpi",
      council_type: "ifc",
      name: "Rensselaer IFC",
      title_key: COUNCIL_CUSTOM_TITLE_KEY,
      custom_title: "Recruitment Chair",
      accept_terms_privacy: true,
    });
  });

  it("sends nothing for an incomplete draft", () => {
    expect(councilCreateBody(ifcDraft())).toBeNull();
    expect(
      councilCreateBody({ ...EMPTY_COUNCIL_DRAFT, titleKey: "president" }),
    ).toBeNull();
  });

  it("names the council on its button", () => {
    expect(createCouncilLabel("RPI IFC")).toBe("Create RPI IFC");
    expect(createCouncilLabel("  ")).toBe("Create council");
  });
});

describe("councilMetaLine", () => {
  it("reads the type, then the school's short name", () => {
    expect(councilMetaLine("ifc", RPI)).toBe("Interfraternity Council · RPI");
    expect(councilMetaLine("other", { name: "Union College" })).toBe(
      "Another council · Union College",
    );
    expect(councilMetaLine(null, null)).toBe("");
  });
});
