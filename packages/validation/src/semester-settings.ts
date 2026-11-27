/**
 * Chapter settings → Semester and Privacy (#6028): the words both pages say,
 * and the rules the Semester page reads off the chapter's archives. Semester
 * is web-only (Paul, 2026-11-27, #4074: a twice-a-year desk task); Privacy is
 * on both apps, so its words live here for the phone's screen too.
 *
 * The archive rules mirror the API's (`spec/behavior/semester-rollover.md`):
 * the current semester runs from the day after the latest archive's last
 * day, the latest archive being the newest by `created_at`, and a chapter
 * starts at most one new semester per calendar month, counted in UTC.
 */

/** The fields of a `semester_archives` row these rules read. */
export interface SemesterArchiveDates {
  start_date?: string;
  end_date: string;
  created_at?: string;
}

function latestArchive<T extends SemesterArchiveDates>(
  archives: readonly T[],
): T | null {
  let latest: T | null = null;
  for (const archive of archives) {
    if (!archive.end_date) continue;
    if (
      latest === null ||
      (archive.created_at ?? "") > (latest.created_at ?? "")
    ) {
      latest = archive;
    }
  }
  return latest;
}

/** `YYYY-MM-DD` of a UTC calendar day. */
function isoDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * The first day of the current semester (`YYYY-MM-DD`): the day after the
 * latest archive ends. Null when the chapter has never started a new
 * semester, so the current one runs from the chapter's start.
 */
export function currentSemesterStart(
  archives: readonly SemesterArchiveDates[],
): string | null {
  const latest = latestArchive(archives);
  return latest ? dayAfter(latest.end_date) : null;
}

/** The calendar day after a `YYYY-MM-DD` day, or null when it isn't one. */
export function dayAfter(day: string): string | null {
  const at = new Date(`${day.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime())) return null;
  return isoDay(new Date(at.getTime() + 24 * 60 * 60 * 1000));
}

/**
 * When the chapter can next start a new semester (`YYYY-MM-01`), or null
 * when it can now: the API refuses a second one in the calendar month (UTC)
 * of the latest archive (`semester-rollover.service.ts`).
 */
export function semesterRolloverOpensOn(
  archives: readonly SemesterArchiveDates[],
  now: Date = new Date(),
): string | null {
  const latest = latestArchive(archives);
  if (!latest?.created_at) return null;
  const created = new Date(latest.created_at);
  if (Number.isNaN(created.getTime())) return null;
  const sameMonth =
    created.getUTCFullYear() === now.getUTCFullYear() &&
    created.getUTCMonth() === now.getUTCMonth();
  if (!sameMonth) return null;
  return isoDay(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  );
}

/**
 * The new-semester page's dates before the officer types any: the first day
 * of the semester ending (the day after the last archive, or none) and its
 * last day, today (local, as the officer reads the calendar).
 */
export function newSemesterDefaults(
  archives: readonly SemesterArchiveDates[],
  now: Date = new Date(),
): { start: string; end: string } {
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return { start: currentSemesterStart(archives) ?? "", end: today };
}

/**
 * The Semester page's words (the concept of #6028, Paul's "go as drawn"
 * 2026-11-27). The archive is named by the semester that ends: the API files
 * the label and dates as the archive, so the words say so, where they used to
 * name the new period.
 */
export const SEMESTER_SETTINGS_COPY = {
  /** The rail's and the new page's way back. */
  title: "Semester",
  thisSemester: "This semester",
  currentRow: "Current semester",
  /** `day` is formatted ("May 9"); null before any semester has ended. */
  currentValue: (day: string | null) =>
    day ? `Since ${day}` : "Since the chapter joined",
  newRow: "Start a new semester",
  /** The row's value while the month's one rollover is spent. */
  opensOn: (day: string) => `From ${day}`,
  thisSemesterFootnote:
    "Points are kept when a semester ends. Standings count from the new one.",
  archived: "Archived semesters",
  noArchives: "None yet",
  archivedFootnote:
    "Standings and members' points can show any archived semester.",
  loadingArchives: "Loading archives",

  // The new-semester page (`?tab=semester&page=new`).
  newTitle: "Start a new semester",
  nameLabel: "Name of the semester ending",
  namePlaceholder: "Fall 2026",
  firstDay: "First day",
  lastDay: "Last day",
  firstDayPlaceholder: "e.g. January 12",
  lastDayPlaceholder: "e.g. May 8",
  /** `pledgeTerm` is the chapter's word, "New Member" by default. */
  promoteLabel: (pledgeTerm: string) =>
    `Make every ${pledgeTerm} a full member`,
  promoteLine: "Their other roles are kept.",
  limitFootnote: "A chapter can start one new semester a month.",
  submit: "Start new semester",
  /** The submit's dimmed words while it can't be pressed yet. */
  nameFirst: "Name the semester first",
  pickDates: "Pick a first and last day",
  pickDatesHint: "Try a date like January 12 or May 8.",

  confirmTitle: (name: string) => `End ${name} and start a new semester?`,
  /**
   * `range` is "May 9 – December 15, 2026"; `from` the new semester's first
   * day ("December 16").
   */
  confirmBody: (
    name: string,
    range: string,
    from: string | null,
    promote: { pledgeTerm: string } | null,
  ) =>
    [
      from
        ? `${name}, ${range}, is archived and standings count from ${from}.`
        : `${name}, ${range}, is archived and standings count from the next day.`,
      "Points already awarded are kept.",
      promote
        ? `Every ${promote.pledgeTerm} also becomes a full member and keeps their other roles. This can't be undone in one step.`
        : null,
    ]
      .filter(Boolean)
      .join(" "),
  started: "New semester started",
  startedBody: (name: string, promote: { pledgeTerm: string } | null) =>
    promote
      ? `${name} is archived, and every ${promote.pledgeTerm} is now a full member.`
      : `${name} is archived.`,
  failed: "Couldn't start a new semester",
  failedFallback: "A chapter can start one new semester a month.",
} as const;

/** Chapter settings → Privacy, on web and the phone. */
export const PRIVACY_SETTINGS_COPY = {
  title: "Privacy",
  label: "Chapter analytics",
  line: "Which features get used, never what's in them.",
  footnote:
    "Members' identities are hashed and messages are never sent. Off stops analytics for every member. Changes are recorded in Logs.",
  readOnly: "Your role can't change this.",
  /** The phone's Chapter settings row value. */
  on: "On",
  off: "Off",
  turnedOn: "Analytics turned on",
  turnedOff: "Analytics turned off",
  saveFailed: "Couldn't change analytics",
} as const;
