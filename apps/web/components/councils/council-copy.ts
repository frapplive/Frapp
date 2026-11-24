/**
 * The words of the council screens on the web (#5933): Start a council, the
 * council's home and its settings.
 *
 * The phone draws the same screens in the same words (rulebook § 6, P6.5).
 * These belong in `@repo/validation` beside `council.ts`, where both apps can
 * read one copy; they sit here only until that move, which is one import
 * change for this app.
 */

export const START_COUNCIL_COPY = {
  title: "Start a council",
  schoolLabel: "School",
  noSchool: "Starting a council takes a verified school email.",
  verifySchool: "Verify your school email",
  typeLabel: "Council type",
  typePlaceholder: "Pick a council type",
  nameLabel: "Council name",
  titleLabel: "Your title",
  titlePlaceholder: "Pick your title",
  somethingElse: "Something else",
  customTitleLabel: "Your title, as you'd write it",
  customTitlePlaceholder: "Recruitment Chair",
  submit: "Start council",
  typeRequired: "Pick a council type.",
  nameRequired: "Name the council.",
  titleRequired: "Pick your title.",
  customTitleRequired: "Type your title.",
  termsRequired: "Accept the Terms of Service and Privacy Policy to go on.",
  createFailed:
    "Couldn't start the council. Check your connection and try again.",
  /** The council exists, but switching into it failed; Start retries the switch. */
  openFailed: (name: string) =>
    `${name} is set up, but it didn't open. Try again.`,
  open: (name: string) => `Open ${name}`,
  inviteTitle: "Invite your delegates",
  finish: "Finish",
  skip: "Skip for now",
  backToChat: "Back to chat",
  startingChapter: "Starting a chapter?",
  createChapter: "Create a chapter",
  schoolBack: "Back",
} as const;

/** The way in, wherever a chapter can be started or joined. */
export const START_COUNCIL_ENTRY = {
  prompt: "Starting a council?",
  action: "Start a council",
} as const;

/** The officer setup checklist's heading in a council's chat. */
export const COUNCIL_SETUP_TITLE = "Set up your council";

export const COUNCIL_HOME_COPY = {
  unverified: "Not verified yet",
  nextLabel: "Next steps",
  invite: "Invite delegates",
  titles: "Edit titles",
} as const;

export const COUNCIL_SETTINGS_COPY = {
  group: "Council",
  tab: "Council",
  profile: "Council profile",
  name: "Name",
  type: "Type",
  school: "School",
  status: "Status",
  verified: "Verified",
  unverified: "Not verified yet",
  saved: "Saved",
  saveFailed: "Couldn't save the name. Try again in a moment.",
  nameRequired: "Name the council.",
  logo: "Logo",
  noAccess: "Your role can't change this.",
} as const;
