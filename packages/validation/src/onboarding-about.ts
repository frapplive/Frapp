/**
 * "About you": the optional step after the name in the screens after a join
 * (#5284; asked by Paul 2026-11-17 and Shawn 2026-11-23). Phone, major,
 * graduation year and birthday, the profile fields officers and later
 * features (email lists, meeting follow-ups) build on. Web `/welcome` and the
 * phone's s03 show it in the same words, after `How the chapter sees you` and
 * before notifications.
 *
 * It collects nothing new: every field is already on the profile form
 * (`PROFILE_FIELD_COPY`), and Phone Number is already on the App Store label.
 * A field the app doesn't collect today is legal copy for Paul first.
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
} as const;

/** The four profile fields the step asks for, as either app reads them. */
export type AboutYouFields = {
  phone: string | null | undefined;
  major: string | null | undefined;
  graduationYear: number | null | undefined;
  birthdayMonth: number | null | undefined;
  birthdayDay: number | null | undefined;
};

/**
 * Whether the step shows: when any of phone, major, graduation year or
 * birthday (month and day) is empty. A member who has them all skips it.
 */
export function needsAboutYou(profile: AboutYouFields): boolean {
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
    profile.birthdayDay === undefined
  );
}
