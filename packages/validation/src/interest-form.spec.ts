import { describe, expect, it } from "vitest";
import {
  INTEREST_FORM_AGREE_LABEL,
  interestFormConsentPlain,
  interestFormConsentText,
  interestFormSensitiveTopic,
  normalizeInterestFormLabel,
} from "./interest-form";

/**
 * The consent text is legal copy Paul approved on #5932 (2026-11-24),
 * `spec/behavior/ifc-recruitment.md` § Consent and privacy text. These pin
 * it word for word, so a reword fails here and goes back to the spec and to
 * Paul first.
 */
describe("the interest form's consent text", () => {
  it("is the approved text at a school with a council", () => {
    expect(
      interestFormConsentPlain({
        chapter: "Phi Gamma Delta",
        school: "RPI",
        council: "RPI IFC",
      }),
    ).toBe(
      "By submitting, you share this information with Phi Gamma Delta at RPI so they can contact you about joining. " +
        "Your name, email, class year and phone also go to RPI IFC, the council Phi Gamma Delta belongs to on Frapp, which keeps one recruitment list for RPI. " +
        "The council sees how many chapters you've signed up with, and which one you join. Other chapters don't see that you signed up here. " +
        "Frapp stores this for them. You can withdraw from this chapter, or delete your recruitment information entirely, at any time from the link we email you. We don't ask for your grades here. " +
        "If the council checks eligibility, you'll be asked to sign a separate release in Frapp, unless you've already signed one with RPI. Either way, we'll tell you when your eligibility is checked, and you can revoke at any time.",
    );
  });

  it("names the chapter and council in bold", () => {
    const strong = interestFormConsentText({
      chapter: "Phi Gamma Delta",
      school: "RPI",
      council: "RPI IFC",
    })
      .filter((run) => run.strong)
      .map((run) => run.text);
    expect(strong).toEqual(["Phi Gamma Delta", "RPI IFC"]);
  });

  it("says the council it joins when the chapter has none yet", () => {
    expect(
      interestFormConsentPlain({
        chapter: "Phi Gamma Delta",
        school: "RPI",
        council: null,
      }),
    ).toContain(
      "also go to the council it joins, which keeps one recruitment list for RPI.",
    );
  });

  it("leaves out the school's sentences for a chapter with no school", () => {
    expect(
      interestFormConsentPlain({
        chapter: "Phi Gamma Delta",
        school: null,
        council: null,
      }),
    ).toBe(
      "By submitting, you share this information with Phi Gamma Delta so they can contact you about joining. " +
        "Frapp stores this for them. You can withdraw from this chapter, or delete your recruitment information entirely, at any time from the link we email you. We don't ask for your grades here.",
    );
  });

  it("has the required box word for word", () => {
    expect(INTEREST_FORM_AGREE_LABEL).toBe("I agree, and I'm 18 or older");
  });
});

describe("the question guard", () => {
  it("names a topic Frapp never collects", () => {
    expect(interestFormSensitiveTopic("What is your religion?")).toBe(
      "religion",
    );
    expect(interestFormSensitiveTopic("Upload a photo")).toBe("a photo");
  });

  it("lets ordinary recruitment questions through", () => {
    for (const ok of [
      "What is your intended major?",
      "Did you go to orientation?",
      "Straight A student?",
      "How did you hear about us?",
    ]) {
      expect(interestFormSensitiveTopic(ok)).toBeNull();
    }
  });
});

describe("a QR label", () => {
  it("folds what an officer types to its stored shape", () => {
    expect(normalizeInterestFormLabel("  Tabling Quad! ")).toBe("tabling-quad");
  });
});
