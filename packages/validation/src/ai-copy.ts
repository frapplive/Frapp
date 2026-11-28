import { AI_MINIMUM_AGE } from "./legal";
/**
 * The words around Frapp Intelligence, shared by web and mobile so the two never say
 * different things about it (`spec/behavior/ai.md` § Consent).
 *
 * The member meets Frapp Intelligence on one screen, "Meet Frapp Intelligence" (#4790, Paul
 * 2026-11-13): during onboarding, once on next open for an account that
 * never answered, and at an AI entry point for a member who chose Not now.
 * It says what Frapp Intelligence does in three lines, names the companies it works
 * with in one, and links the privacy policy, which carries the detail.
 * Continue is the member's Yes; Not now is a No they can change in
 * Settings. Paul's rule for the wording: say no more about the process than
 * the member needs.
 *
 * The companies are not here: the API serves them (`GET /v1/ai/consent`,
 * `sheet.providers`), so an app built before a provider changes still names
 * the current ones.
 */

/** The president's switches, as the API names them (`AI_CHAPTER_SWITCHES`). */
export type AiChapterSwitchKey =
  "meeting_notes" | "ask" | "chat_source" | "nudges";

export interface AiSwitchCopy {
  key: AiChapterSwitchKey;
  label: string;
  /**
   * The line under the switch, on web's AI page and the phone's AI screen
   * alike: the promise in a row's width (#4789; web too since #6028, when
   * the two-line `description` each switch carried for web went).
   */
  short: string;
  /** The switch this one only matters under, drawn nested beneath it. */
  dependsOn?: AiChapterSwitchKey;
}

/**
 * In the order the settings page draws them: the beta feature first, then
 * Ask and the switch that lets Ask and summaries read channel messages, then
 * nudges, the one that starts on (Paul, 2026-11-17).
 */
export const AI_SWITCHES: readonly AiSwitchCopy[] = [
  {
    key: "meeting_notes",
    label: "Minutes from notes",
    short:
      "A first draft of the minutes from an officer's notes. Never for Standards.",
  },
  {
    key: "ask",
    label: "Questions and requests",
    short:
      "Members ask and get answers from the chapter's documents, minutes and records.",
  },
  {
    key: "chat_source",
    label: "Include channel messages",
    short:
      "Answers and channel summaries read chapter channels. Only members with Frapp Intelligence on, never DMs.",
    dependsOn: "ask",
  },
  {
    key: "nudges",
    label: "Nudges on Activity",
    short:
      "A short card on a member's Activity when one of their tasks could use a word.",
  },
];

/** The chapter's switches as the API serves them; a missing one reads as off. */
export type AiChapterSwitchValues = Partial<
  Record<AiChapterSwitchKey, boolean>
>;

/**
 * How one switch draws, the same on web and the phone (#4789): its own
 * value; whether the switch it depends on is off (`parentOff`, drawn
 * muted); and whether it waits on that parent (`waitsOnParent`: off, so it
 * can't be turned on until the parent is, and says so). A switch whose
 * parent is off but which is still on stays usable, so a president can
 * clear what it would do.
 */
export function aiSwitchState(
  entry: AiSwitchCopy,
  settings: AiChapterSwitchValues | null | undefined,
) {
  const checked = settings?.[entry.key] === true;
  const parentOff =
    entry.dependsOn !== undefined && settings?.[entry.dependsOn] !== true;
  return { checked, parentOff, waitsOnParent: parentOff && !checked };
}

/**
 * How many of the chapter's AI features are working: a switch counts only
 * when it and the one it depends on are on, since Include channel messages
 * does nothing with Ask off (the server keeps it either way).
 */
export function aiSwitchesInEffect(
  settings: AiChapterSwitchValues | null | undefined,
): number {
  return AI_SWITCHES.filter((entry) => {
    const { checked, parentOff } = aiSwitchState(entry, settings);
    return checked && !parentOff;
  }).length;
}

export const AI_SETTINGS_COPY = {
  title: "AI",
  /**
   * The switches' group heading, drawn only while the Diagnostics group
   * shows under it (one beta chapter); otherwise the page is one group.
   */
  featuresHeading: "Features",
  /**
   * The footnote under the switches, on web's AI page and the phone's AI
   * screen alike (#6028). No company names (Paul, 2026-11-17): they are on
   * Meet Frapp Intelligence and in the privacy policy.
   */
  footnote:
    "Each member also chooses for themselves whether Frapp Intelligence is on.",
  /** The phone's row in a member's own Settings that opens these switches. */
  chapterRow: "Chapter AI",
  /** That row's value: how many of the chapter's switches are on. */
  chapterRowValue: (on: number) => `${on} on`,
  presidentOnly: "Only the chapter president can turn these on or off.",
  dependsOnAsk: "Turn on Questions and requests first.",
  lastChanged: (date: string) => `Last changed ${date}.`,
  turnedOn: (label: string) => `${label} turned on`,
  turnedOff: (label: string) => `${label} turned off`,
  saveFailed: "Couldn't change the AI setting",
  loadFailed: "Couldn't load the chapter's AI settings",
  /** The phone's AI screen reached where the server has no AI, or by a viewer it doesn't open to. */
  unavailable: "AI features aren't available here.",
  offlineTitle: "AI settings unavailable offline",
  offlineDescription: "Reconnect to see which AI features are on.",
  retryLater: "Retry in a moment.",
} as const;

/**
 * The footnote under the chapter's AI switches, on web and the phone (#6028):
 * who can change them, what each member chooses, and when they last changed.
 * `lastChanged` is the formatted day, or null when they never have.
 */
export function aiSettingsFootnote(
  canChange: boolean,
  lastChanged: string | null,
): string {
  return [
    canChange ? null : AI_SETTINGS_COPY.presidentOnly,
    AI_SETTINGS_COPY.footnote,
    lastChanged ? AI_SETTINGS_COPY.lastChanged(lastChanged) : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/** One line of what Frapp Intelligence does, on the Meet Frapp Intelligence screen. */
export interface FrappAiPoint {
  key: "ask" | "catch_up" | "nudge";
  text: string;
}

export const FRAPP_AI_COPY = {
  title: "Meet Frapp Intelligence",
  points: [
    {
      key: "ask",
      text: "Ask anything about your chapter and get an answer with its sources.",
    },
    { key: "catch_up", text: "Catch up on a busy channel in a few lines." },
    {
      key: "nudge",
      text: "Get a nudge when something needs you, with a place to start.",
    },
  ] as readonly FrappAiPoint[],
  /**
   * The one line that makes Continue an explicit yes (Apple 5.1.2(i)): who
   * it works with, and that Continue confirms you're 18 or older and turns
   * it on (#5627: members may join at 17, AI
   * stays 18, `AI_MINIMUM_AGE`). It names only the member's account: the
   * chapter's switches start on (#5294), so it no longer has a "for you and
   * your chapter" form.
   */
  disclosure: (providers: string) =>
    `Frapp Intelligence works with ${providers}. Continuing confirms you're ${AI_MINIMUM_AGE} or older and turns it on for your account.`,
  privacyLink: "Privacy policy",
  continue: "Continue",
  notNow: "Not now",
  saveFailed: "Couldn't turn on Frapp Intelligence. Try again.",
  loadFailed: "Couldn't load your Frapp Intelligence setting",
  offlineTitle: "Frapp Intelligence setting unavailable offline",
  offlineDescription: "Reconnect to see whether Frapp Intelligence is on.",
  /** Settings: the member's own switch. */
  settingsTitle: "Frapp Intelligence",
  settingsSwitch: "Frapp Intelligence",
  /**
   * What it does, not who it works with: the companies are named on Meet
   * Frapp Intelligence, which turning the switch on opens, and in the privacy policy
   * (Paul, 2026-11-17).
   */
  settingsCaption:
    "Ask questions, catch up on channels, draft minutes and get nudges.",
  /** The line under the Frapp Intelligence page's group; `privacyLink` is the linked words. */
  settingsFootnote:
    "What Frapp Intelligence reads and who it works with is in the",
  turnOffFailed: "Couldn't turn off Frapp Intelligence",
  turnedOn: "Frapp Intelligence is on",
  turnedOff: "Frapp Intelligence is off",
} as const;

/** `["Anthropic", "Google"]` → `"Anthropic and Google"`. */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * A stored timestamp as the day it fell on where the reader is, written out
 * (`November 12, 2026`), per the product's date rule: no "Nov 12", no
 * "Yesterday".
 */
export function formatAiAnswerDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
