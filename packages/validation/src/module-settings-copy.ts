import { joinNames } from "./ai-copy";
import type { GoalMetric } from "./chapter-goals";
import type { MeetingSectionKey } from "./meetings";

/**
 * The words a module page of Chapter settings says (#6030), on web and the
 * phone alike, so the two can't drift (rulebook § 1.6, P6.5). Each page's
 * layout lives in its app; what its rows, lines and footnotes say lives here.
 * The Who can and Goals footnotes sit beside the Chapter tab's in
 * `chapter-settings-copy.ts`.
 */

/** The line a viewer reads where they can read a setting but not change it. */
export const ROLE_CANT_CHANGE_THESE = "Your role can't change these.";

/** The switch row's line for a viewer who can't switch modules. */
export const ROLE_CANT_SWITCH_MODULES =
  "Your role can't switch modules on or off.";

/** What an always-on module (Chat, Announcements) says where a switch would be. */
export const MODULE_ALWAYS_ON = "Always on";

/**
 * The module switch row's line: what being off takes away, then the role's
 * line. Empty for an on module a viewer can switch, so the row draws none.
 */
export function moduleSwitchLine(module: {
  on: boolean;
  alwaysOn: boolean;
  offNote: string;
  canManage: boolean;
}): string | undefined {
  const parts: string[] = [];
  if (!module.on && !module.alwaysOn) {
    parts.push(
      `Off. ${module.offNote} Turning it back on brings everything back; nothing was deleted.`,
    );
  }
  if (!module.alwaysOn && !module.canManage)
    parts.push(ROLE_CANT_SWITCH_MODULES);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

/** A module's tier as a person reads it: "Free", or "Chapter Pro" (not "Paid"). */
export function moduleTierLabel(tier: string): string {
  return tier === "paid" ? "Chapter Pro" : "Free";
}

/**
 * The footnote under a module's Rules: they're logged, and whether the viewer
 * can change them, after the module's own lead line when it has one.
 */
export function moduleRulesFootnote(canManage: boolean, lead?: string): string {
  const logged = "Changes are recorded in Logs.";
  const said = lead ? `${lead} ${logged}` : logged;
  return canManage ? said : `${said} ${ROLE_CANT_CHANGE_THESE}`;
}

/** A number typed into a rule, its unit after the field. */
export type NumberRuleCopy = {
  label: string;
  hint: string;
  suffix: string;
};

/** Points → Rules: the two limits on points added or taken by hand. */
export const POINTS_RULES_COPY = {
  lead: "Limits on points added or taken by hand; points from events, tasks and service aren't limited.",
  rate: {
    label: "Adjustments per officer each hour",
    hint: "Past this, an officer's next one waits for the hour.",
    suffix: "an hour",
  },
  flag: {
    label: "Flag adjustments of",
    hint: "Up or down, flagged in the ledger for another officer to check.",
    suffix: "points",
  },
} as const satisfies {
  lead: string;
  rate: NumberRuleCopy;
  flag: NumberRuleCopy;
};

/** Service hours → Rules: the point rate and the proof switch. */
export const SERVICE_RULES_COPY = {
  rate: {
    label: "Minutes of service per point",
    suffix: "minutes",
  },
  proof: {
    label: "Ask for proof",
    hint: "A photo or a signed slip, which the approving officer sees.",
  },
} as const;

/** "6 hours", "1 hour", "1.5 hours". */
function hoursWord(hours: number): string {
  const shown = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${shown} ${hours === 1 ? "hour" : "hours"}`;
}

/**
 * The point rate's line, worked for a real member: "A 3-hour shift earns 6
 * points, and 10 points take 5 hours. Entries already approved keep theirs."
 */
export function serviceRateHint(
  shiftPoints: number,
  minutesPerPoint: number,
): string {
  const points = `${shiftPoints.toLocaleString("en-US")} ${shiftPoints === 1 ? "point" : "points"}`;
  return `A 3-hour shift earns ${points}, and 10 points take ${hoursWord((10 * minutesPerPoint) / 60)}. Entries already approved keep theirs.`;
}

/** Each goal's words: its row, its field's line and unit, and its save. */
export const GOAL_METRIC_COPY: Readonly<
  Record<GoalMetric, NumberRuleCopy & { saved: string }>
> = {
  points: {
    label: "Points goal",
    hint: "Points each member works toward this semester. Leave it empty for no goal.",
    suffix: "points",
    saved: "Points goal saved",
  },
  service: {
    label: "Service hours goal",
    hint: "Approved service hours each member works toward this semester. Leave it empty for no goal.",
    suffix: "hours",
    saved: "Service hours goal saved",
  },
  study: {
    label: "Study hours goal",
    hint: "Study hours each member works toward each week, Sunday to Saturday. Leave it empty for no goal.",
    suffix: "hours a week",
    saved: "Study hours goal saved",
  },
};

/** The words of a goal's own page (#1062, #6030). */
export const GOAL_PAGE_COPY = {
  hint: "Each member sees a ring toward their goal on Activity, under their week. Set a different goal for a role, and a member holding several answers to their highest-ranked one.",
  addRole: "Different goal for a role",
  findRole: "Find a role",
  removedRole: "Removed role",
} as const;

/** The line under a role's own goal. */
export function goalRoleHint(roleName: string): string {
  return `Members who hold ${roleName} work toward this instead. Leave it empty to hold them to no goal.`;
}

/** Meetings → Sections in the minutes: what each section holds. */
export const MEETING_SECTION_HINTS: Readonly<
  Record<MeetingSectionKey, string>
> = {
  tldr: "Two or three short lines for every member: the gist of the meeting.",
  attendees:
    "Who checked in to the meeting's event: present, late and excused.",
  summary: "A few paragraphs on what the meeting covered.",
  announcements: "What officers announced.",
  dates:
    "The days the meeting named, as calendar tiles: installation, a deadline, the next formal.",
  decisions:
    "Motions and what was decided, with the vote count when one was taken.",
  action_items: "What needs doing, who it's on, and when it's due.",
  tabled:
    "What the meeting put off to a later meeting, with the date it was first tabled.",
  officer_reports: "Each officer's report.",
  old_business: "Items carried over from earlier meetings.",
  new_business: "Items raised for the first time.",
  discussion_log:
    "Every topic the meeting covered, with what was said about it.",
};

/** Meetings' row and its page. */
export const MEETING_SECTIONS_COPY = {
  title: "Sections in the minutes",
  footnote:
    "Every meeting's minutes show these, in this order. A section switched off keeps what earlier minutes wrote in it.",
  failed: "Couldn't change the sections",
} as const;

/** Announcements' one group: the channel officers post in. */
export const ANNOUNCEMENTS_CHANNEL_COPY = {
  heading: "Where they post",
  label: "Announcements channel",
  footnote: "Who can post is set on the channel.",
} as const;

/**
 * The phone's module screens end with this where the viewer holds a module's
 * officer tool (Chat admin, Discord import, the points ledger, service
 * history, Study zones, Export a report, web's `SETTINGS_TOOLS`): those stay
 * on the web dashboard (Paul's pick, #6030). Said once, as a footnote, not on
 * every row. `permission` is the tool's own gate.
 */
export const MODULE_TOOLS_ON_WEB: Readonly<
  Record<string, { permission: string; line: string }>
> = {
  chat: {
    permission: "channels:manage",
    line: "Chat admin and Discord import are on the web dashboard.",
  },
  points: {
    permission: "points:view_all",
    line: "The points ledger is on the web dashboard.",
  },
  hours: {
    permission: "service:approve",
    line: "Service history is on the web dashboard.",
  },
  geofences: {
    permission: "geofences:manage",
    line: "Zones are drawn on the web dashboard.",
  },
  reports: {
    permission: "reports:export",
    line: "Reports are exported on the web dashboard.",
  },
};

/**
 * A bounded whole number as typed into a rule or a goal, or the sentence
 * saying why it isn't one, said under the field on save or leaving it, never
 * per keystroke (Paul, 2026-11-06). Both apps' number rows read it.
 */
export function readBoundedNumber(
  draft: string,
  min: number,
  max: number,
): { value: number } | { error: string } {
  const trimmed = draft.trim();
  if (trimmed === "") return { error: "Enter a number." };
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < min) {
    return { error: `Use a whole number from ${min}.` };
  }
  if (value > max) {
    return { error: `Use ${max.toLocaleString("en-US")} or less.` };
  }
  return { value };
}

/** "1 day", "7 days". */
function daysWord(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/**
 * Recruitment's module page (#5924, #5934, #5973, #6030), on web and the
 * phone: its Rules' day counts, its Joining and Sign-ups picks, and its
 * Stages and Tags pages.
 */
export const RUSH_SETTINGS_COPY = {
  roleCantChange: "Your role can't change this.",
  staleDays: {
    label: "Needs follow-up after",
    hint: "Days without a logged contact",
    readOnly: (days: number) =>
      `Needs follow-up after ${daysWord(days)} without a logged contact`,
    failed: "Couldn't save the follow-up days",
  },
  bidDays: {
    label: "Bids expire after",
    hint: "Unless the prospect answers first",
    readOnly: (days: number) => `Bids expire after ${daysWord(days)}`,
    failed: "Couldn't save how long bids last",
  },
  daysSuffix: "days",
  daysRange: (min: number, max: number) => `Pick from ${min} to ${max} days.`,
  joining: {
    heading: "Joining",
    footnote:
      "A prospect whose acceptance is confirmed is invited to join with this role.",
    label: "New member role",
    noRole: "Your New members tier has no role. Pick one.",
    defaultSuffix: " (default)",
    pick: "Pick a role",
    rolesFailed: "Couldn't load roles",
  },
  signUps: {
    heading: "Sign-ups",
    footnote:
      "Used once your interest form is open. The card shows a name and stage, never contact details.",
    contacts: "Recruitment contacts",
    contactsHint: "Told about each sign-up, with recruitment's managers",
    noGroup: "No Group",
    pickGroup: "Pick a Group",
    card: "Card channel",
    cardHint: "Only a channel everyone in it can open recruitment",
    noCard: "No card",
    pickChannel: "Pick a channel",
  },
  stages: {
    title: "Stages",
    hint: "Where a prospect is in recruitment.",
    editHint:
      "Where a prospect is in recruitment. Rename, hide or reorder a stage within its group.",
    add: "Add a stage",
    newStage: (category: string) => `New ${category.toLowerCase()} stage`,
    hidden: "Hidden",
    show: (label: string) => `Show ${label} on the board`,
    failed: "Couldn't save the stages",
    loadFailed: "Couldn't load the stages.",
  },
  tags: {
    title: "Tags",
    hint: "Labels members put on prospects.",
    none: "No tags yet.",
    add: "Add a tag",
    newTag: "New tag",
    full: (max: number) => `A chapter can have up to ${max} tags.`,
    deleteTitle: (label: string) => `Delete ${label}?`,
    deleteBody: "It comes off every prospect tagged with it.",
    deleteAction: "Delete tag",
    loadFailed: "Couldn't load the tags.",
  },
  stagesAndTagsFailed: "Couldn't load the stages and tags.",
} as const;

/** The contacts row's warning: who in the Group can't open recruitment. */
export function rushContactsSkippedLine(names: readonly string[]): string {
  return `${joinNames(names)} can't open recruitment, so ${
    names.length === 1 ? "isn't" : "aren't"
  } told.`;
}
