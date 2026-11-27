import {
  interestFormSensitiveLine,
  interestFormSensitiveTopic,
} from "@repo/validation";
import type { InterestFormQuestion } from "./use-interest-form";

/**
 * The interest form's own questions as an officer edits them (#5977,
 * `ifc-recruitment.md` § Fields), on web's Recruitment page and the phone's
 * alike: the kinds a question can be, in the spec's order and a person's
 * words, which kinds take options, the topic a question may never ask about,
 * and the list as it is saved. Pure, so both editors send the same list.
 */

/** The kinds of question, the chat form card's types (#3926). */
export const INTEREST_QUESTION_TYPES: readonly {
  type: InterestFormQuestion["type"];
  label: string;
}[] = [
  { type: "short_answer", label: "Short answer" },
  { type: "paragraph", label: "Paragraph" },
  { type: "multiple_choice", label: "One choice" },
  { type: "checkboxes", label: "Several choices" },
  { type: "yes_no", label: "Yes or no" },
];

const CHOICE = new Set(["multiple_choice", "checkboxes", "dropdown"]);

/** Whether a kind of question lists options to pick from. */
export function isChoiceQuestion(type: string): boolean {
  return CHOICE.has(type);
}

/** A kind's name, as the pick reads it. */
export function interestQuestionTypeLabel(type: string): string {
  return (
    INTEREST_QUESTION_TYPES.find((entry) => entry.type === type)?.label ?? type
  );
}

/** A short client id for a question or option not yet saved. */
export function newInterestFormId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Why a question is held back, said beside it before the server would refuse
 * it: a topic Frapp never collects. Null for one that may be asked.
 */
export function interestQuestionProblem(
  question: InterestFormQuestion,
): string | null {
  const topic = interestFormSensitiveTopic(
    [question.title, ...(question.options ?? []).map((o) => o.label)].join(" "),
  );
  return topic ? interestFormSensitiveLine(topic) : null;
}

/**
 * A question changed to another kind: a choice kind keeps its options, or
 * starts with one empty option to fill in; any other kind has none.
 */
export function withQuestionType(
  question: InterestFormQuestion,
  type: InterestFormQuestion["type"],
): InterestFormQuestion {
  return {
    ...question,
    type,
    options: isChoiceQuestion(type)
      ? question.options?.length
        ? question.options
        : [{ id: newInterestFormId(), label: "" }]
      : undefined,
  };
}

/**
 * The list as it is saved, or null while any question isn't ready: one
 * without a title, on a topic held back, or a choice with no option named.
 * Titles and options are trimmed and empty options dropped.
 */
export function interestQuestionsToSave(
  questions: readonly InterestFormQuestion[],
): InterestFormQuestion[] | null {
  const ready = questions.every(
    (question) =>
      question.title.trim() &&
      !interestQuestionProblem(question) &&
      (!isChoiceQuestion(question.type) ||
        (question.options ?? []).some((option) => option.label.trim())),
  );
  if (!ready) return null;
  return questions.map((question) => ({
    ...question,
    title: question.title.trim(),
    ...(isChoiceQuestion(question.type)
      ? {
          options: (question.options ?? [])
            .map((option) => ({ ...option, label: option.label.trim() }))
            .filter((option) => option.label),
        }
      : { options: undefined }),
  }));
}
