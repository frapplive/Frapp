import type { Activity } from "./activity-rows";

/** The sections `needs_you_count` is summed from. */
const COUNTED_SECTIONS: ReadonlySet<Activity["unavailable"][number]> = new Set([
  "tasks",
  "hours_approvals",
  "polls",
  "cards",
  "coming_up",
  // Due reminders count too (#4957).
  "reminders",
  // And the minutes waiting on the member (#5949).
  "minutes",
]);

/**
 * Activity's count, on the phone's Activity tab and on web's Activity row in
 * the sidebar (#5946): the number of things waiting on the member, or `null`
 * for no chip (the read has not answered, or nothing waits). One rule for
 * both apps, so the two never show different numbers for the same member.
 *
 * It stops at 99+ (`foundations.md` § 9).
 *
 * A section the server could not read is served empty and named in
 * `unavailable`, so the count then leaves it out. The chip says so with a
 * `+` ("2+", "at least 2 waiting on you") instead of stating a total it
 * does not have. With nothing counted there is still no chip: the Activity
 * screen is where a failed section is named.
 */
export function activityCountChip(
  activity: Pick<Activity, "needs_you_count" | "unavailable"> | undefined,
): { label: string; spoken: string } | null {
  const count = activity?.needs_you_count ?? 0;
  if (!activity || count <= 0) return null;
  const partial = activity.unavailable.some((section) =>
    COUNTED_SECTIONS.has(section),
  );
  if (count > 99) {
    return { label: "99+", spoken: "more than 99 waiting on you" };
  }
  return partial
    ? { label: `${count}+`, spoken: `at least ${count} waiting on you` }
    : { label: String(count), spoken: `${count} waiting on you` };
}
