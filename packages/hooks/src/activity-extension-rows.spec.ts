import { describe, expect, it } from "vitest";
import {
  activityReviewRows,
  activityRowFixedDeadline,
  activityRowAction,
  activityRowTaskId,
  extensionDueWords,
  findActivityExtensionRow,
  type Activity,
  type ActivityTaskExtension,
} from "./activity-rows";

const NOW = new Date("2026-11-26T15:00:00");

const extension = (
  over: Partial<ActivityTaskExtension> = {},
): ActivityTaskExtension =>
  ({
    id: "req-1",
    task: {
      id: "task-1",
      title: "Sweep the porch",
      assignee_id: "member-1",
    },
    requester_name: "Sam Lee",
    reason: "Shift ran late",
    from_due_date: "2026-11-26",
    from_due_at: null,
    to_due_date: "2026-11-28",
    to_due_at: null,
    needs_officer: "over_a_day",
    ai_verdict: null,
    ai_note: null,
    created_at: "2026-11-26T12:00:00Z",
    ...over,
  }) as ActivityTaskExtension;

const activity = (extensions: ActivityTaskExtension[]) =>
  ({
    needs_you: {
      tasks: [],
      task_confirmations: [],
      task_extensions: extensions,
      hours_approvals: [],
      polls: [],
      cards: [],
    },
  }) as unknown as Activity;

describe("requests for more time in Activity (#6096)", () => {
  it("lists each as a row that opens, naming who asks, the task and why", () => {
    const [row] = activityReviewRows(activity([extension()]), NOW);
    expect(row).toMatchObject({
      kind: "extension",
      key: "needs:extension:req-1",
      title: "Sam Lee asks for more time",
      detail: "Sweep the porch · to Saturday · More than a day",
      faceId: "member-1",
      unread: false,
      readRef: null,
    });
    // The officer reads the reason first: no one-press action on the row.
    expect(activityRowAction(row)).toBe(null);
    expect(activityRowTaskId(row)).toBe("task-1");
  });

  it("names a time when one was asked for", () => {
    expect(
      extensionDueWords(
        { to_due_date: "2026-11-27", to_due_at: "2026-11-27T22:00:00Z" },
        new Date("2026-11-26T12:00:00Z"),
      ),
    ).toMatch(/^tomorrow at \d/);
  });

  it("finds the waiting request a push opens, and nothing once answered", () => {
    expect(
      findActivityExtensionRow(activity([extension()]), "task-1", NOW)?.key,
    ).toBe("needs:extension:req-1");
    expect(findActivityExtensionRow(activity([]), "task-1", NOW)).toBe(null);
  });

  it("reads an API from before requests as having none", () => {
    const old = activity([]);
    delete (old.needs_you as Partial<Activity["needs_you"]>).task_extensions;
    expect(activityReviewRows(old, NOW)).toEqual([]);
  });

  it("reddens only the member's own open To do row with a fixed deadline", () => {
    const row = (over: Record<string, unknown>, key = "needs:task:t1") =>
      ({
        kind: "task",
        key,
        glyph: "task",
        task: { fixed_deadline: true, stored_status: "TODO", ...over },
      }) as unknown as Parameters<typeof activityRowFixedDeadline>[0];
    expect(activityRowFixedDeadline(row({}))).toBe(true);
    expect(activityRowFixedDeadline(row({ fixed_deadline: false }))).toBe(
      false,
    );
    expect(activityRowFixedDeadline(row({ stored_status: "COMPLETED" }))).toBe(
      false,
    );
    // A task the member assigned is someone else's to finish by it.
    expect(activityRowFixedDeadline(row({}, "made:task:t1"))).toBe(false);
  });
});
