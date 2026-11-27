/**
 * Words three officer tools in Chapter settings say (#6031), in the shape of
 * Discord's channel settings (Paul, 2026-11-20): Discord import, the Reports
 * form and Study zones. All three are web-only (`spec/ui/mobile/navigation.md`
 * § Web-only tools), so only web reads these; they live here with the rest of
 * the settings pages' words so a phone port starts from the same sentences.
 */

/** Discord import, opened from the Chat module page's row. */
export const DISCORD_IMPORT_COPY = {
  title: "Discord import",
  backLabel: "Chat",
  connect: "Connect Discord",
  connectLine: "Recommended. Needs the Manage Server permission.",
  /** Connect Discord's line while the bot isn't usable here. */
  connectUnavailable: "Not available here. Upload an export instead.",
  upload: "Upload an export",
  uploadLine: "From DiscordChatExporter on a computer.",
  startFootnote:
    "Messages, threads, files, reaction counts and categories come over, and private channels stay private. DMs, voice and who holds which role stay behind.",
  finishedDescription: "Your Discord history is in Frapp.",
  importGroup: "Import",
  server: "Server",
  messages: "Messages",
  files: "Files",
  channels: "Channels and threads",
  finished: "Finished",
  issues: "Didn't come over",
  deleteImport: "Delete import",
  deleteFootnote:
    "Removes the messages and files it brought in. The roles and read permissions it made stay.",
  resumeImport: "Resume import",
  /** The state the Chat page's Discord import row shows at its end. */
  notStarted: "Not started",
  stopped: "Stopped on an error",
} as const;

/** "Importing 42%", or "Importing" before there is an honest percent. */
export function discordImportingLabel(percent: number | null): string {
  return percent === null ? "Importing" : `Importing ${percent}%`;
}

/** A category row's value while importing: "12 of 40 done". */
export function discordCategoryDoneLabel(done: number, total: number): string {
  return `${done.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} done`;
}

export type ReportKindKey = "attendance" | "points" | "roster" | "service";

/** The Reports export form (`/settings?tab=reports&page=reports`). */
export const REPORTS_COPY = {
  report: "Report",
  event: "Event",
  member: "Member",
  dates: "Dates",
  timeWindow: "Time window",
  from: "From",
  to: "To",
  allEvents: "All events",
  allMembers: "All members",
  thisSemester: "This semester",
  allTime: "All time",
  custom: "Custom",
  downloadPdf: "Download PDF",
  generate: "Generate report",
  export: "Export",
  preview: "Preview",
  kinds: {
    attendance: "Attendance",
    points: "Points",
    roster: "Member roster",
    service: "Service hours",
  } satisfies Record<ReportKindKey, string>,
  /** The group's footnote: what the chosen report holds. */
  holds: {
    attendance: "Each member's status and check-in time.",
    points: "Each member's points by category over the time window.",
    roster: "Every member with their role, join date and balance.",
    service: "Each service entry, approved and pending, with its hours.",
  } satisfies Record<ReportKindKey, string>,
} as const;

/** The Preview group's heading: "Preview · 25 of 132 rows", "Preview · 1 row". */
export function reportPreviewHeading(total: number | null, shown = 25): string {
  if (total === null) return REPORTS_COPY.preview;
  const rows = (n: number) =>
    `${n.toLocaleString("en-US")} ${n === 1 ? "row" : "rows"}`;
  return total > shown
    ? `${REPORTS_COPY.preview} · ${shown.toLocaleString("en-US")} of ${rows(total)}`
    : `${REPORTS_COPY.preview} · ${rows(total)}`;
}

/** Study zones' list and its map editor. */
export const STUDY_ZONES_COPY = {
  zones: "Zones",
  /** At a zone row's end, for a zone switched off. */
  off: "Off",
  name: "Name",
  earns: "Earns",
  points: "Points",
  every: "Every",
  shortestSession: "Shortest session",
  pauseGrace: "Pause grace",
  pointsUnit: "points",
  minutesUnit: "minutes",
  earnsFootnote:
    "Shorter sessions earn nothing. A session left in the background past its grace ends.",
} as const;
