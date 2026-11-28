import { describe, expect, it } from "vitest";
import {
  rowIsSentBack,
  rowNeedsSignOff,
  selectEveryonesTasks,
  toTaskRow,
} from "./board";

function at(year: number, month: number, day: number, hour = 12): Date {
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

const NOW = at(2026, 8, 17);
const ME = "viewer-1";

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    title: "Submit ride-share list",
    assignee_id: ME,
    status: "TODO",
    stored_status: "TODO",
    due_date: "2026-08-18",
    completed_at: null,
    point_reward: 5,
    points_awarded: false,
    ...overrides,
  };
}

const titles = (rows: { title: string }[]) => rows.map((row) => row.title);


describe("toTaskRow — photos, proof and send-back (#4635)", () => {
  it("carries the new fields off the wire", () => {
    const row = toTaskRow(
      task({
        status: "IN_PROGRESS",
        stored_status: "IN_PROGRESS",
        proof_kind: "link",
        proof_link: "https://example.com",
        sent_back_at: "2026-08-16T12:00:00Z",
        sent_back_reason: "Floor is still sticky",
        completion_note: "",
        photos: [
          { id: "p1", kind: "reference", storage_path: "a/1.jpg", position: 0 },
          { id: "bad", kind: "other", storage_path: "a/2.jpg" },
        ],
      }),
    )!;
    expect(row).toMatchObject({
      proofKind: "link",
      proofLink: "https://example.com",
      sentBackAt: "2026-08-16T12:00:00Z",
      sentBackReason: "Floor is still sticky",
      completionNote: null,
      photos: [{ id: "p1", kind: "reference", storage_path: "a/1.jpg" }],
    });
    expect(rowIsSentBack(row)).toBe(true);
    expect(rowNeedsSignOff(row)).toBe(true);
  });

  it("reads a pre-#4635 row as asking for nothing, never sent back", () => {
    const row = toTaskRow(task({ point_reward: null }))!;
    expect(row.proofKind).toBe("none");
    expect(row.photos).toEqual([]);
    expect(rowIsSentBack(row)).toBe(false);
    expect(rowNeedsSignOff(row)).toBe(false);
  });

  it("stops reading Needs changes once it is marked done again", () => {
    const row = toTaskRow(
      task({
        status: "COMPLETED",
        stored_status: "COMPLETED",
        sent_back_at: "2026-08-16T12:00:00Z",
      }),
    )!;
    expect(rowIsSentBack(row)).toBe(false);
  });
});

describe("toTaskRow — groups and Up for grabs (tasks.md § Up for grabs)", () => {
  it("reads a group copy's summary and the posting it was claimed from", () => {
    const row = toTaskRow(
      task({
        group: {
          audience: "role",
          target_id: "role-1",
          target_name: "Recruitment",
          total: 6,
          done: 2,
          confirmed: 1,
        },
        group_id: "g1",
        open_task_id: "open-1",
      }),
    )!;
    expect(row.group).toEqual({
      audience: "role",
      targetId: "role-1",
      targetName: "Recruitment",
      total: 6,
      done: 2,
      confirmed: 1,
    });
    expect(row.groupId).toBe("g1");
    expect(row.openTaskId).toBe("open-1");
  });

  it("reads a one-person task as no group, claimed from nothing", () => {
    const row = toTaskRow(task({ group: { total: 3 } }))!;
    expect(row.group).toBeNull();
    expect(row.openTaskId).toBeNull();
  });
});

describe("selectEveryonesTasks (#5948)", () => {
  it("survives a payload that is not a list", () => {
    for (const value of [null, undefined, {}, "rows", 7]) {
      expect(selectEveryonesTasks(value, NOW).total).toBe(0);
    }
  });

  it("drops rows that cannot be drawn honestly", () => {
    const board = selectEveryonesTasks(
      [
        task({ id: "keep" }),
        task({ id: undefined, title: "No id" }),
        task({ id: "no-title", title: "" }),
      ],
      NOW,
    );
    expect(board.total).toBe(1);
  });

  it("lists every member's tasks, by the status the server shows", () => {
    const board = selectEveryonesTasks(
      [
        task({ id: "a", title: "Mine to do" }),
        task({
          id: "b",
          title: "Cole's, started",
          assignee_id: "cole",
          status: "IN_PROGRESS",
          stored_status: "IN_PROGRESS",
        }),
        task({
          id: "c",
          title: "Late",
          assignee_id: "sam",
          status: "OVERDUE",
          stored_status: "TODO",
          due_date: "2026-08-15",
        }),
        task({
          id: "d",
          title: "Waiting",
          assignee_id: "sam",
          status: "COMPLETED",
          stored_status: "COMPLETED",
          completed_at: "2026-08-16T12:00:00Z",
        }),
      ],
      NOW,
    );
    expect(titles(board.lanes.todo)).toEqual(["Mine to do"]);
    expect(titles(board.lanes.in_progress)).toEqual(["Cole's, started"]);
    expect(titles(board.lanes.overdue)).toEqual(["Late"]);
    expect(titles(board.lanes.completed)).toEqual(["Waiting"]);
    expect(board.total).toBe(4);
  });

  it("keeps a confirmed task a week, then lets it go", () => {
    const confirmed = (id: string, at: string) =>
      task({
        id,
        title: id,
        status: "COMPLETED",
        stored_status: "COMPLETED",
        points_awarded: true,
        completed_at: at,
        confirmed_at: at,
      });
    const board = selectEveryonesTasks(
      [
        confirmed("recent", "2026-08-15T12:00:00Z"),
        confirmed("old", "2026-08-01T12:00:00Z"),
      ],
      NOW,
    );
    expect(titles(board.lanes.confirmed)).toEqual(["recent"]);
  });
});
