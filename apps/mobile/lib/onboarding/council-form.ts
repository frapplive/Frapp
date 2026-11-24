import type { CreateCouncilInput, MySchool } from "@repo/hooks";
import {
  COUNCIL_CUSTOM_TITLE_KEY,
  COUNCIL_NAME_MAX,
  COUNCIL_PROFILES,
  COUNCIL_TITLE_MAX,
  COUNCIL_TYPES,
  defaultCouncilName,
  pickableCouncilTitles,
  type CouncilType,
} from "@repo/validation";

/**
 * Start a council on the phone (#5933; `spec/architecture/school-layer.md`
 * § 5.3): the founder's school, the council's type, its name and the
 * founder's own title. The screen is `components/onboarding/create-council.tsx`;
 * what it decides lives here, where a spec can reach it.
 */

/** Every word the flow shows that isn't already shared. */
export const COUNCIL_FORM_COPY = {
  /** The entry points' action, beside "Create a chapter". */
  start: "Create a council",
  /** The join screen's quiet line: "Starting a council? Create a council". */
  startingPrompt: "Starting a council?",
  startHint: "Opens council setup.",
  schoolTitle: "Which school is your council at?",
  typeTitle: "What kind of council?",
  detailsTitle: "Tell us about your council",
  nameLabel: "Council name",
  titleLabel: "Your title",
  titlePlaceholder: "Pick your title",
  customTitleLabel: "Title",
  customTitlePlaceholder: "Recruitment Chair",
  somethingElse: "Something else",
  /** The council setup's progress ticks, for a screen reader. */
  progress: "Council setup",
  nameMissing: "Give your council a name.",
  nameTooLong: `Keep the name to ${COUNCIL_NAME_MAX} characters.`,
  titleMissing: "Pick your title.",
  customTitleMissing: "Type your title.",
  customTitleTooLong: `Keep your title to ${COUNCIL_TITLE_MAX} characters.`,
  createFailed:
    "Couldn't create that council. Check the details and try again.",
  /** The council exists but the switch into it didn't take. */
  openFailed:
    "Your council is ready, but we couldn't open it. Check your connection and try again.",
} as const;

export function createCouncilLabel(name: string): string {
  return `Create ${name.trim() || "council"}`;
}

export function openCouncilLabel(name: string): string {
  return `Open ${name.trim() || "council"}`;
}

/**
 * The steps the flow draws, from how many schools the founder has proved an
 * address at (`GET /v1/schools/mine`): none, and the first step is the
 * school-email check s03 uses; several, and they pick one. Then the type, then
 * the details. Only a council at a school where they're verified can start
 * (`school-layer.md` § 5.3, rule 4), so the check is never skipped.
 */
export type CouncilStep = "verify" | "school" | "type" | "details";

export function councilSteps(schoolCount: number): CouncilStep[] {
  if (schoolCount === 0) return ["verify", "type", "details"];
  if (schoolCount === 1) return ["type", "details"];
  return ["school", "type", "details"];
}

/** The type step's rows: each profile's name over its one line. */
export function councilTypeChoices(): {
  type: CouncilType;
  label: string;
  description: string;
}[] {
  return COUNCIL_TYPES.map((type) => ({
    type,
    label: COUNCIL_PROFILES[type].label,
    description: COUNCIL_PROFILES[type].description,
  }));
}

/**
 * The titles the founder picks theirs from: the type's seeded titles in the
 * pack's order, then "Something else", which names a new role on the
 * Executive board (`school-layer.md` § 5.3, rule 2).
 */
export function councilTitleChoices(
  type: CouncilType,
): { value: string; label: string }[] {
  return [
    ...pickableCouncilTitles(type).map(({ key, name }) => ({
      value: key,
      label: name,
    })),
    { value: COUNCIL_CUSTOM_TITLE_KEY, label: COUNCIL_FORM_COPY.somethingElse },
  ];
}

/** What the founder has said so far. */
export interface CouncilDraft {
  school: Pick<MySchool["school"], "id" | "name" | "short_name"> | null;
  type: CouncilType | null;
  name: string;
  /** Typed over: a new type or school no longer renames it. */
  nameEdited: boolean;
  /** A seeded title's key, {@link COUNCIL_CUSTOM_TITLE_KEY}, or none yet. */
  titleKey: string | null;
  customTitle: string;
}

export const EMPTY_COUNCIL_DRAFT: CouncilDraft = {
  school: null,
  type: null,
  name: "",
  nameEdited: false,
  titleKey: null,
  customTitle: "",
};

/** The name offered for this school and type: "RPI IFC", "RPI Panhellenic". */
function offeredName(draft: CouncilDraft): string {
  if (!draft.type || !draft.school) return draft.name;
  return defaultCouncilName(
    draft.type,
    draft.school.short_name || draft.school.name,
  );
}

/** A school picked: the offered name follows it until the founder types one. */
export function withCouncilSchool(
  draft: CouncilDraft,
  school: CouncilDraft["school"],
): CouncilDraft {
  const next = { ...draft, school };
  return next.nameEdited ? next : { ...next, name: offeredName(next) };
}

/**
 * A type picked. The offered name follows it until the founder types one,
 * and a title the new type doesn't seed is dropped, so a Panhellenic VP
 * Finance never reaches an IFC create. A title of their own stays.
 */
export function withCouncilType(
  draft: CouncilDraft,
  type: CouncilType,
): CouncilDraft {
  const offered = councilTitleChoices(type).some(
    (choice) => choice.value === draft.titleKey,
  );
  const next: CouncilDraft = {
    ...draft,
    type,
    titleKey: offered ? draft.titleKey : null,
  };
  return next.nameEdited ? next : { ...next, name: offeredName(next) };
}

export function withCouncilName(
  draft: CouncilDraft,
  name: string,
): CouncilDraft {
  return { ...draft, name, nameEdited: true };
}

/** The title row's value: the seeded title's name, or the one they typed. */
export function councilTitleValue(draft: CouncilDraft): string | null {
  if (!draft.type || !draft.titleKey) return null;
  return (
    councilTitleChoices(draft.type).find(
      (choice) => choice.value === draft.titleKey,
    )?.label ?? null
  );
}

/** Enough to press Create: the gate the button reads, never an error. */
export function councilDraftComplete(draft: CouncilDraft): boolean {
  if (!draft.school || !draft.type || !draft.name.trim() || !draft.titleKey) {
    return false;
  }
  return (
    draft.titleKey !== COUNCIL_CUSTOM_TITLE_KEY ||
    draft.customTitle.trim().length > 0
  );
}

/**
 * What's wrong with the draft when Create is pressed, in the words the form
 * shows, or `null`. Checked on submit, never per keystroke (`components.md`
 * § Text input); the API checks the same limits (`CreateCouncilDto`).
 */
export function councilDraftProblem(draft: CouncilDraft): string | null {
  const name = draft.name.trim();
  if (!name) return COUNCIL_FORM_COPY.nameMissing;
  if (name.length > COUNCIL_NAME_MAX) return COUNCIL_FORM_COPY.nameTooLong;
  if (!draft.titleKey) return COUNCIL_FORM_COPY.titleMissing;
  if (draft.titleKey === COUNCIL_CUSTOM_TITLE_KEY) {
    const title = draft.customTitle.trim();
    if (!title) return COUNCIL_FORM_COPY.customTitleMissing;
    if (title.length > COUNCIL_TITLE_MAX) {
      return COUNCIL_FORM_COPY.customTitleTooLong;
    }
  }
  return null;
}

/**
 * `POST /v1/councils`' body, or `null` while the draft isn't complete. The
 * Terms checkbox the form draws is the founder's acceptance, for the council
 * and for themselves, as chapter setup's is.
 */
export function councilCreateBody(
  draft: CouncilDraft,
): CreateCouncilInput | null {
  if (!councilDraftComplete(draft) || councilDraftProblem(draft)) return null;
  const custom = draft.titleKey === COUNCIL_CUSTOM_TITLE_KEY;
  return {
    school_id: draft.school!.id,
    council_type: draft.type!,
    name: draft.name.trim(),
    title_key: draft.titleKey!,
    ...(custom ? { custom_title: draft.customTitle.trim() } : {}),
    accept_terms_privacy: true,
  };
}

/** "Interfraternity Council · RPI", under the council's name. */
export function councilMetaLine(
  type: CouncilType | null | undefined,
  school: { name?: string | null; short_name?: string | null } | null,
): string {
  return [
    type ? COUNCIL_PROFILES[type].label : null,
    school?.short_name || school?.name || null,
  ]
    .filter(Boolean)
    .join(" · ");
}
