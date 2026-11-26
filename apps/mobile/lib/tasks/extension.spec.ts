import { describe, expect, it } from "vitest";
import { TASK_EXTENSION_COPY } from "@repo/validation";
import type { TaskExtensionSummary } from "@repo/hooks";
import { toTaskRow, type TaskRowModel } from "./board";
import {
  EXTENSION_DUE_NOT_LATER,
  EXTENSION_REASON_MISSING,
  extensionAsk,
  extensionAskedLine,
  extensionDecidedLine,
  extensionDraftOf,
  extensionLines,
  rowCantAskForMoreTime,
  rowDueUrgentForViewer,
  declineProblem,
} from "./extension";

const NOW = new Date(2026, 10, 18, 12, 0);

function row(overrides: Record<string, unknown> = {}): TaskRowModel {
  return toTaskRow({
    id: "t1",
    title: "Sweep the porch",
    created_by: "officer",
    assignee_id: "me",
    status: "TODO",
    stored_status: "TODO",
    due_date: "2026-11-20",
    points_awarded: false,
    ...overrides,
  })!;
}

const summary = (
  overrides: Record<string, unknown> = {},
): TaskExtensionSummary =>
  ({
    id: "x1",
    status: "approved",
    reason: "Shift ran late",
    from_due_date: "2026-11-20",
    from_due_at: null,
    to_due_date: "2026-11-21",
    to_due_at: null,
    needs_officer: null,
    auto_approved: false,
    decline_reason: null,
    decided_at: "2026-11-18T10:00:00.000Z",
    created_at: "2026-11-18T09:00:00.000Z",
    ...overrides,
  }) as TaskExtensionSummary;

describe("reading a task's extension (#6096)", () => {
  it("reads fixed_deadline, the latest request and whether the member is blocked", () => {
    const read = row({
      fixed_deadline: true,
      extension: summary({ needs_officer: "over_a_day", status: "pending" }),
      extension_requests_blocked: true,
    });
    expect(read.fixedDeadline).toBe(true);
    expect(read.extension?.status).toBe("pending");
    expect(read.extension?.needs_officer).toBe("over_a_day");
    expect(read.extensionRequestsBlocked).toBe(true);
  });

  it("drops a request in a shape this build can't read", () => {
    expect(
      row({ extension: { id: "x", status: "lost" } }).extension,
    ).toBeNull();
    expect(
      row({ extension: summary({ needs_officer: "new_reason" }) }).extension
        ?.needs_officer,
    ).toBeNull();
  });
});

describe("rowCantAskForMoreTime", () => {
  it("lets the assignee of an open, dated task ask", () => {
    expect(rowCantAskForMoreTime(row(), "me")).toBeNull();
  });

  it("says why not, in the shared rule's order", () => {
    expect(rowCantAskForMoreTime(row(), "someone-else")).toBe("not_mine");
    expect(rowCantAskForMoreTime(row({ due_date: null }), "me")).toBe("no_due");
    expect(rowCantAskForMoreTime(row({ fixed_deadline: true }), "me")).toBe(
      "fixed",
    );
    expect(
      rowCantAskForMoreTime(
        row({ extension: summary({ status: "pending" }) }),
        "me",
      ),
    ).toBe("waiting");
    expect(
      rowCantAskForMoreTime(row({ extension_requests_blocked: true }), "me"),
    ).toBe("blocked");
    expect(
      rowCantAskForMoreTime(
        row({ status: "COMPLETED", stored_status: "COMPLETED" }),
        "me",
      ),
    ).toBe("done");
  });

  it("draws a fixed deadline red to its assignee only", () => {
    const fixed = row({ fixed_deadline: true });
    expect(rowDueUrgentForViewer(fixed, "me")).toBe(true);
    expect(rowDueUrgentForViewer(fixed, "officer")).toBe(false);
  });
});

describe("extensionLines", () => {
  it("says the fixed deadline where Ask would be, in the red", () => {
    expect(
      extensionLines(row({ fixed_deadline: true }), {
        viewerId: "me",
        canManage: false,
        now: NOW,
      }),
    ).toEqual([
      { text: TASK_EXTENSION_COPY.fixedNoExtensions, tone: "danger" },
    ]);
  });

  it("says a request waits, and when the member can't ask", () => {
    expect(
      extensionLines(row({ extension: summary({ status: "pending" }) }), {
        viewerId: "me",
        canManage: false,
        now: NOW,
      }),
    ).toEqual([{ text: TASK_EXTENSION_COPY.waiting, tone: "muted" }]);
    expect(
      extensionLines(row({ extension_requests_blocked: true }), {
        viewerId: "me",
        canManage: false,
        now: NOW,
      }).map((line) => line.text),
    ).toEqual([TASK_EXTENSION_COPY.blocked]);
  });

  it("says the latest answer to the assignee and officers, not to anyone else", () => {
    const decided = row({ extension: summary({ auto_approved: true }) });
    expect(
      extensionLines(decided, { viewerId: "me", canManage: false, now: NOW }),
    ).toEqual([
      { text: "Extended to Saturday · approved automatically", tone: "muted" },
    ]);
    expect(
      extensionLines(decided, {
        viewerId: "officer",
        canManage: true,
        now: NOW,
      }),
    ).toHaveLength(1);
    expect(
      extensionLines(decided, {
        viewerId: "follower",
        canManage: false,
        now: NOW,
      }),
    ).toEqual([]);
  });
});

describe("extensionDecidedLine", () => {
  it("names the officer's reason on a decline, and says nothing while it waits", () => {
    expect(
      extensionDecidedLine(
        summary({ status: "declined", decline_reason: "The event is Friday" }),
        NOW,
      ),
    ).toBe("Not extended: The event is Friday");
    expect(
      extensionDecidedLine(summary({ status: "pending" }), NOW),
    ).toBeNull();
  });
});

describe("extensionDraftOf", () => {
  it("opens a day after a day's due", () => {
    expect(extensionDraftOf(row(), NOW)).toEqual({
      date: "2026-11-21",
      time: null,
    });
  });

  it("keeps the time on a task due at one", () => {
    const at = new Date(2026, 10, 20, 17, 0).toISOString();
    expect(extensionDraftOf(row({ due_at: at }), NOW)).toEqual({
      date: "2026-11-21",
      time: "17:00",
    });
  });

  it("moves an overdue task's on to a day still to come", () => {
    expect(extensionDraftOf(row({ due_date: "2026-11-10" }), NOW)).toEqual({
      date: "2026-11-18",
      time: null,
    });
    const at = new Date(2026, 10, 16, 9, 0).toISOString();
    expect(
      extensionDraftOf(row({ due_date: "2026-11-16", due_at: at }), NOW),
    ).toEqual({ date: "2026-11-19", time: "09:00" });
  });
});

describe("extensionAsk", () => {
  it("sends only the day for a task due by the day", () => {
    expect(
      extensionAsk(row(), { date: "2026-11-21", time: null }, " Late ", NOW),
    ).toEqual({
      ok: true,
      body: { due_date: "2026-11-21", reason: "Late" },
    });
  });

  it("sends the moment and the local day for a task due at a time", () => {
    const at = new Date(2026, 10, 20, 17, 0).toISOString();
    const ask = extensionAsk(
      row({ due_at: at }),
      { date: "2026-11-21", time: "18:30" },
      "Late",
      NOW,
    );
    expect(ask).toEqual({
      ok: true,
      body: {
        due_date: "2026-11-21",
        due_at: new Date(2026, 10, 21, 18, 30).toISOString(),
        reason: "Late",
      },
    });
  });

  it("refuses a due that isn't later, then an empty reason", () => {
    expect(
      extensionAsk(row(), { date: "2026-11-20", time: null }, "Late", NOW),
    ).toEqual({ ok: false, problem: EXTENSION_DUE_NOT_LATER });
    expect(
      extensionAsk(row(), { date: "2026-11-21", time: null }, "  ", NOW),
    ).toEqual({ ok: false, problem: EXTENSION_REASON_MISSING });
  });
});

describe("extensionAskedLine", () => {
  it("says more time was granted with the new due, or that it waits", () => {
    expect(
      extensionAskedLine({ extension: summary(), now_blocked: false }, NOW),
    ).toBe("More time granted · now due Saturday");
    expect(
      extensionAskedLine(
        {
          extension: summary({ status: "pending" }),
          now_blocked: true,
        },
        NOW,
      ),
    ).toBe(`${TASK_EXTENSION_COPY.waiting}. ${TASK_EXTENSION_COPY.blocked}`);
  });
});

describe("declineProblem", () => {
  it("needs a reason", () => {
    expect(declineProblem(" ")).not.toBeNull();
    expect(declineProblem("The event is Friday")).toBeNull();
  });
});
