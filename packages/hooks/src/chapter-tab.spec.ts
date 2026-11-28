import { describe, expect, it } from "vitest";
import {
  BIRTHDAY_POSTS_COPY,
  birthdayPostChoices,
  chapterArchetypeSwitchPatch,
  chapterIdentityBrandingDiff,
  chapterIdentityFieldDiff,
  chapterIdentityDraftOf,
  chapterIdentityValue,
  chapterMarkBrandingDiff,
  chapterMarkDraftOf,
  chapterMarkValue,
  chapterProfileFieldBody,
  chapterProfileSaveBody,
  chapterVocabularyFieldPatch,
  chapterVocabularyDraftOf,
  chapterVocabularyPatch,
  chapterVocabularyValue,
  checkFoundedYear,
  foundedYearProblem,
  offersBirthdayPosts,
  readChapterBranding,
} from "./chapter-tab";

const STORED = {
  name: "Phi Gamma Delta Tau Nu",
  university: "RPI",
  donation_url: "https://give.rpi.edu/fiji",
};

describe("chapterProfileSaveBody", () => {
  it("sends nothing when nothing changed, spaces aside", () => {
    expect(
      chapterProfileSaveBody(STORED, { ...STORED, name: ` ${STORED.name} ` }),
    ).toEqual({});
  });

  // A name stored before the 3-character minimum, such as "XY", must not
  // refuse an officer's edit of the donation link.
  it("sends only the donation link when only it changed", () => {
    const stored = { ...STORED, name: "XY" };
    expect(
      chapterProfileSaveBody(stored, {
        ...stored,
        donation_url: "https://give.rpi.edu/fiji-2027",
      }),
    ).toEqual({ donation_url: "https://give.rpi.edu/fiji-2027" });
  });

  it("sends a changed name and university trimmed", () => {
    expect(
      chapterProfileSaveBody(STORED, {
        ...STORED,
        name: " Tau Nu ",
        university: "Rensselaer ",
      }),
    ).toEqual({ name: "Tau Nu", university: "Rensselaer" });
  });

  it("sends a cleared name, so the API says what it needs", () => {
    expect(chapterProfileSaveBody(STORED, { ...STORED, name: "  " })).toEqual({
      name: "",
    });
  });

  it("leaves out a cleared donation link, which the API can't clear", () => {
    expect(
      chapterProfileSaveBody(STORED, { ...STORED, donation_url: "" }),
    ).toEqual({});
  });
});

describe("chapterProfileFieldBody", () => {
  it("sends the one field typed, and nothing for one typed back", () => {
    expect(chapterProfileFieldBody(STORED, "university", " Rensselaer ")).toEqual(
      { university: "Rensselaer" },
    );
    expect(chapterProfileFieldBody(STORED, "name", STORED.name)).toEqual({});
  });
});

describe("readChapterBranding", () => {
  it("keeps each key of the right type and drops the rest", () => {
    expect(
      readChapterBranding({
        greek_letters: "ΣΦΕ",
        short_name: 7,
        show_greek_letters: "no",
        founded_at: 1901,
      }),
    ).toEqual({
      greek_letters: "ΣΦΕ",
      short_name: undefined,
      show_greek_letters: undefined,
      designation: undefined,
      school_short: undefined,
      founded_at: 1901,
    });
  });

  it("reads nothing from a missing object", () => {
    expect(readChapterBranding(null).greek_letters).toBeUndefined();
  });
});

describe("Chapter mark", () => {
  it("always sends the switch, and the short name only to keep or clear one", () => {
    expect(
      chapterMarkBrandingDiff({
        shortName: "  ",
        showLetters: true,
        lettersHidden: false,
        stored: {},
      }),
    ).toEqual({ show_greek_letters: true });
    expect(
      chapterMarkBrandingDiff({
        shortName: "",
        showLetters: true,
        lettersHidden: false,
        stored: { short_name: "Sig Ep" },
      }),
    ).toEqual({ show_greek_letters: true, short_name: "" });
  });

  it("writes the letters off for an organization that hides them", () => {
    expect(
      chapterMarkBrandingDiff({
        shortName: "FIJI",
        showLetters: true,
        lettersHidden: true,
        stored: {},
      }),
    ).toEqual({ show_greek_letters: false, short_name: "FIJI" });
  });

  it("reads the stored mark as the page's two fields", () => {
    expect(chapterMarkDraftOf({ short_name: "Sig Ep" })).toEqual({
      shortName: "Sig Ep",
      showLetters: true,
    });
  });

  it("names what the mark draws", () => {
    expect(
      chapterMarkValue({
        logoUrl: "https://x/logo.png",
        branding: {},
        name: "A",
      }),
    ).toBe("Logo");
    expect(
      chapterMarkValue({
        logoUrl: null,
        branding: { short_name: "Sig Ep", greek_letters: "ΣΦΕ" },
        name: "Sigma Phi Epsilon",
      }),
    ).toBe("Sig Ep");
    expect(
      chapterMarkValue({
        logoUrl: null,
        branding: { greek_letters: "ΣΦΕ" },
        name: "Sigma Phi Epsilon",
      }),
    ).toBe("ΣΦΕ");
    expect(
      chapterMarkValue({
        logoUrl: null,
        branding: { greek_letters: "ΣΦΕ", show_greek_letters: false },
        name: "Sigma Phi Epsilon",
      }),
    ).toBe("Initials");
  });

  // FIJI never shows its letters, even with the switch never turned off.
  it("never names FIJI's letters", () => {
    expect(
      chapterMarkValue({
        logoUrl: null,
        branding: { greek_letters: "ΦΓΔ" },
        name: "Phi Gamma Delta Tau Nu",
      }),
    ).toBe("Initials");
  });
});

describe("Identity & founding", () => {
  const NOW_YEAR = new Date().getFullYear();

  it("accepts an empty year only while none is stored", () => {
    expect(checkFoundedYear("", undefined)).toEqual({
      valid: true,
      cleared: false,
      year: undefined,
    });
    expect(checkFoundedYear(" ", 1901)).toEqual({
      valid: false,
      cleared: true,
      year: undefined,
    });
    expect(checkFoundedYear("1901", undefined).year).toBe(1901);
    expect(checkFoundedYear("1700", undefined).valid).toBe(false);
    expect(checkFoundedYear(String(NOW_YEAR + 2), undefined).valid).toBe(false);
  });

  it("sends a cleared field as empty and leaves never-set ones out", () => {
    const stored = { greek_letters: "ΣΦΕ", designation: "California Eta" };
    expect(
      chapterIdentityBrandingDiff(
        {
          greekLetters: " ΣΦΕ ",
          designation: "",
          schoolShort: "",
          foundedYear: "1901",
        },
        stored,
      ),
    ).toEqual({ greek_letters: "ΣΦΕ", designation: "", founded_at: 1901 });
  });

  it("saves one field with the others as stored", () => {
    const branding = { designation: "California Eta", founded_at: 1901 };
    expect(chapterIdentityFieldDiff(branding, "schoolShort", " UCLA ")).toEqual({
      designation: "California Eta",
      school_short: "UCLA",
      founded_at: 1901,
    });
    expect(chapterIdentityFieldDiff(branding, "designation", "")).toEqual({
      designation: "",
      founded_at: 1901,
    });
  });

  it("says what's wrong with a founded year, or nothing", () => {
    expect(foundedYearProblem("1901", undefined)).toBeNull();
    expect(foundedYearProblem("", undefined)).toBeNull();
    expect(foundedYearProblem("19", undefined)).toMatch(
      /^Enter a year between 1776 and \d{4}\.$/,
    );
    expect(foundedYearProblem("", 1901)).toMatch(
      /^A founded year can't be removed once saved\. Enter a year/,
    );
  });

  it("shows the first fact filled in", () => {
    expect(chapterIdentityValue({ designation: "Tau Nu" }, "X")).toBe("Tau Nu");
    expect(chapterIdentityValue({ founded_at: 1893 }, "X")).toBe(
      "Founded 1893",
    );
    expect(chapterIdentityValue({}, "X")).toBe("Not set");
    expect(
      chapterIdentityValue({ greek_letters: "ΦΓΔ" }, "Phi Gamma Delta Tau Nu"),
    ).toBe("Not set");
  });
});

describe("Organization type", () => {
  it("resets modules and vocabulary to the new type's defaults", () => {
    const patch = chapterArchetypeSwitchPatch("nphc");
    expect(patch.org_archetype).toBe("nphc");
    expect(patch.vocabulary).toBeDefined();
    expect(patch.enabled_modules).toBeDefined();
    expect(patch).not.toHaveProperty("branding");
  });
});

describe("Vocabulary", () => {
  it("sends every word trimmed, a cleared one as empty", () => {
    const draft = chapterVocabularyDraftOf({ recruitment: "Rush" });
    expect(
      chapterVocabularyPatch({
        ...draft,
        recruitment: " ",
        pledge: " Pledge ",
      }),
    ).toEqual({
      vocabulary: {
        recruitment: "",
        pledge: "Pledge",
        class: "",
        order: "",
        tier: "",
      },
    });
  });

  it("saves one word with the others as stored", () => {
    expect(
      chapterVocabularyFieldPatch({ recruitment: "Rush" }, "tier", " Board "),
    ).toEqual({
      vocabulary: {
        recruitment: "Rush",
        pledge: "",
        class: "",
        order: "",
        tier: "Board",
      },
    });
  });

  it("reads Custom once a word differs from the type's", () => {
    expect(chapterVocabularyValue({}, "ifc")).toBe("Defaults");
    expect(chapterVocabularyValue({ pledge: "Associate" }, "ifc")).toBe(
      "Custom",
    );
  });
});

describe("Birthday posts", () => {
  const LIST = [
    { id: "general", name: "general", type: "PUBLIC" },
    { id: "officers", name: "officers", type: "PRIVATE" },
    { id: "old", name: "old", type: "PUBLIC", archived_at: "2026-01-01" },
    { id: "audit", name: "audit", type: "PUBLIC", is_audit_log: true },
  ];

  it("offers only public, live channels", () => {
    expect(LIST.filter(offersBirthdayPosts).map((c) => c.id)).toEqual([
      "general",
    ]);
  });

  it("reads Off, a channel, or paused", () => {
    expect(birthdayPostChoices(LIST, null).value).toBe(BIRTHDAY_POSTS_COPY.off);
    expect(birthdayPostChoices(LIST, "general")).toMatchObject({
      value: "#general",
      paused: false,
    });
    expect(birthdayPostChoices(LIST, "old")).toMatchObject({
      value: "#old",
      paused: true,
    });
    expect(birthdayPostChoices(LIST, "gone").value).toBe(
      BIRTHDAY_POSTS_COPY.removedChannel,
    );
  });

  it("never reads paused before the list loads", () => {
    expect(birthdayPostChoices(undefined, "general")).toMatchObject({
      loaded: false,
      paused: false,
      // Not known yet: never "A removed channel" for a channel still there.
      value: null,
    });
  });
});
