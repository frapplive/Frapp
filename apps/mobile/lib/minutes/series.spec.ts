import { describe, expect, it } from "vitest";
import type { MeetingSummary } from "@repo/hooks";
import { minutesRowTime, seriesRows } from "./series";

/**
 * The series screen's helpers (#5290), what is left of the Minutes list's
 * once it was folded into Documents (#5949).
 */
// A Wednesday at noon, on this machine's clock: the week began Sunday.
const NOW = new Date(2026, 10, 18, 12).getTime();
const daysAgo = (days: number) =>
  new Date(NOW - days * 86_400_000).toISOString();

let next = 0;
function row(over: Partial<MeetingSummary> = {}): MeetingSummary {
  next += 1;
  return {
    id: `m${next}`,
    event_id: `e${next}`,
    event_name: "Chapter Meeting",
    event_start_time: daysAgo(1),
    meeting_type: "chapter",
    other_label: null,
    status: "posted",
    created_by: null,
    posted_at: null,
    updated_at: daysAgo(1),
    series_key: null,
    series_rule: null,
    decision_count: 0,
    action_item_count: 0,
    recorded: false,
    started: true,
    recording_by: null,
    gist: null,
    ...over,
  };
}

describe("seriesRows", () => {
  it("keeps one series' meetings, newest first", () => {
    const rows = [
      row({ id: "old", series_key: "s", event_start_time: daysAgo(14) }),
      row({ id: "other", series_key: "t", event_start_time: daysAgo(2) }),
      row({ id: "new", series_key: "s", event_start_time: daysAgo(0) }),
      row({ id: "one-off", event_start_time: daysAgo(1) }),
    ];
    expect(seriesRows(rows, "s").map((entry) => entry.id)).toEqual([
      "new",
      "old",
    ]);
  });
});

describe("minutesRowTime", () => {
  it("says the weekday and time this calendar week, the date before, and the year only when it differs", () => {
    // Last Wednesday is six days back but not this week: a date, never "Wed".
    expect(minutesRowTime(daysAgo(6.9), NOW)).toMatch(/^Nov \d{1,2}$/);
    expect(minutesRowTime(daysAgo(2), NOW)).toMatch(
      /^[A-Z][a-z]{2} \d{1,2}:\d{2} [AP]M$/,
    );
    expect(minutesRowTime("2026-10-02T23:00:00Z", NOW)).toMatch(
      /^Oct \d{1,2}$/,
    );
    expect(minutesRowTime("2025-10-02T23:00:00Z", NOW)).toMatch(/, 2025$/);
  });
});
