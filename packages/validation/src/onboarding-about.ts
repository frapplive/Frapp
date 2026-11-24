/**
 * "About you": the optional step after the name in the screens after a join
 * (#5284; asked by Paul 2026-11-17 and Shawn 2026-11-23). Phone, major,
 * graduation year and birthday, the profile fields officers and later
 * features (email lists, meeting follow-ups) build on. Web `/welcome` and the
 * phone's s03 show it in the same words, after `How the chapter sees you` and
 * before notifications.
 *
 * It collects nothing new: every field is already on the profile form
 * (`PROFILE_FIELD_COPY`) or the member's own "More details" (#581), and Phone
 * Number is already on the App Store label. A field the app doesn't collect
 * today is legal copy for Paul first.
 *
 * Under the profile fields, the chapter's own fields (#5926, asked by Shawn
 * 2026-11-23): the `required` ones in place, the rest behind one More
 * details row, so the step stays as short as the chapter asks
 * (`aboutYouCustomFields`).
 */
export const ONBOARDING_ABOUT_COPY = {
  title: "About you",
  lede: "Officers use this to reach you, and it fills in your profile in the directory.",
  /** When the notifications screen follows (phone only). */
  continue: "Continue",
  /** When chat is next. */
  goToChat: "Go to chat",
  /** Moves on and saves nothing. */
  skip: "Skip for now",
  saveFailed: "Couldn't save that. Check your connection and try again.",
  /** The row that opens the chapter's optional fields (#5926). */
  moreDetails: "More details",
  /** Beside More details: how many fields it opens. */
  moreDetailsCount: (count: number) => `${count} optional`,
} as const;

/** The four profile fields the step asks for, as either app reads them. */
export type AboutYouFields = {
  phone: string | null | undefined;
  major: string | null | undefined;
  graduationYear: number | null | undefined;
  birthdayMonth: number | null | undefined;
  birthdayDay: number | null | undefined;
};

/** The part of one of the chapter's own fields the step reads (#5926). */
export type AboutYouCustomField = {
  required: boolean;
  value: string | null;
};

/**
 * Which of the chapter's own fields the step asks (#5926): the `required`
 * ones in place (`asked`), and the rest (`more`) behind the More details
 * row, each in the chapter's order. A member always fills in their own
 * values, whoever else sees them (`spec/behavior/members.md` § Custom
 * Fields), so every tier is here.
 */
export function aboutYouCustomFields<T extends AboutYouCustomField>(
  fields: readonly T[] | null | undefined,
): { asked: T[]; more: T[] } {
  const asked: T[] = [];
  const more: T[] = [];
  for (const field of fields ?? []) (field.required ? asked : more).push(field);
  return { asked, more };
}

/**
 * Whether the step shows: when any of phone, major, graduation year or
 * birthday (month and day) is empty, or one of the chapter's required fields
 * has no value (#5926). A member who has them all skips it; an empty
 * optional field alone never asks.
 */
export function needsAboutYou(
  profile: AboutYouFields,
  customFields: readonly AboutYouCustomField[] = [],
): boolean {
  const blank = (value: string | null | undefined) =>
    (value ?? "").trim().length === 0;
  return (
    blank(profile.phone) ||
    blank(profile.major) ||
    profile.graduationYear === null ||
    profile.graduationYear === undefined ||
    profile.birthdayMonth === null ||
    profile.birthdayMonth === undefined ||
    profile.birthdayDay === null ||
    profile.birthdayDay === undefined ||
    customFields.some((field) => field.required && blank(field.value))
  );
}
