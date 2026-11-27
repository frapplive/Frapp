import { describe, expect, it } from "vitest";
import {
  interestQuestionProblem,
  interestQuestionTypeLabel,
  interestQuestionsToSave,
  withQuestionType,
} from "./interest-form-questions";
import type { InterestFormQuestion } from "./use-interest-form";

const question = (
  patch: Partial<InterestFormQuestion> = {},
): InterestFormQuestion => ({
  id: "q1",
  type: "short_answer",
  title: "Hometown",
  required: false,
  ...patch,
});

describe("the interest form's questions (#5977, #6030)", () => {
  it("names each kind as a person reads it", () => {
    expect(interestQuestionTypeLabel("checkboxes")).toBe("Several choices");
  });

  it("starts a choice with one option to fill in, and drops options otherwise", () => {
    const choice = withQuestionType(question(), "multiple_choice");
    expect(choice.options).toHaveLength(1);
    expect(withQuestionType(choice, "paragraph").options).toBeUndefined();
  });

  it("holds the list back while a question has no title or no named option", () => {
    expect(interestQuestionsToSave([question({ title: " " })])).toBeNull();
    expect(
      interestQuestionsToSave([
        question({ type: "checkboxes", options: [{ id: "o1", label: "" }] }),
      ]),
    ).toBeNull();
  });

  it("trims titles and options and drops empty options", () => {
    expect(
      interestQuestionsToSave([
        question({
          title: " Sport ",
          type: "checkboxes",
          options: [
            { id: "o1", label: " Soccer " },
            { id: "o2", label: "" },
          ],
        }),
      ]),
    ).toEqual([
      question({
        title: "Sport",
        type: "checkboxes",
        options: [{ id: "o1", label: "Soccer" }],
      }),
    ]);
  });

  it("holds back a question on a topic Frapp never collects", () => {
    const sensitive = question({ title: "What is your religion?" });
    expect(interestQuestionProblem(sensitive)).not.toBeNull();
    expect(interestQuestionsToSave([sensitive])).toBeNull();
  });
});
