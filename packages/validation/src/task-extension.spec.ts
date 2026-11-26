import { describe, expect, it } from "vitest";
import {
  cantAskForMoreTime,
  extensionFitsADay,
  extensionHours,
} from "./task-extension";

describe("extensionHours", () => {
  it("counts whole days for a task due by a day", () => {
    expect(
      extensionHours({ due_date: "2026-11-26" }, { due_date: "2026-11-27" }),
    ).toBe(24);
    expect(
      extensionHours({ due_date: "2026-11-30" }, { due_date: "2026-12-02" }),
    ).toBe(48);
  });

  it("reads the clock for a task due at a time", () => {
    expect(
      extensionHours(
        { due_date: "2026-11-26", due_at: "2026-11-26T22:00:00.000Z" },
        { due_date: "2026-11-27", due_at: "2026-11-27T04:00:00.000Z" },
      ),
    ).toBe(6);
  });

  it("is null without a day", () => {
    expect(extensionHours({ due_date: null }, { due_date: "2026-11-27" })).toBe(
      null,
    );
  });
});

describe("extensionFitsADay", () => {
  it("fits a day and no more", () => {
    expect(
      extensionFitsADay({ due_date: "2026-11-26" }, { due_date: "2026-11-27" }),
    ).toBe(true);
    expect(
      extensionFitsADay({ due_date: "2026-11-26" }, { due_date: "2026-11-28" }),
    ).toBe(false);
    expect(
      extensionFitsADay(
        { due_date: "2026-11-26", due_at: "2026-11-26T22:00:00.000Z" },
        { due_date: "2026-11-27", due_at: "2026-11-27T22:00:01.000Z" },
      ),
    ).toBe(false);
  });

  it("never fits an earlier or equal due", () => {
    expect(
      extensionFitsADay({ due_date: "2026-11-26" }, { due_date: "2026-11-26" }),
    ).toBe(false);
  });
});

describe("cantAskForMoreTime", () => {
  const task = {
    assignee_id: "me",
    due_date: "2026-11-26",
    stored_status: "TODO",
  };

  it("lets the assignee of an open dated task ask", () => {
    expect(cantAskForMoreTime(task, "me")).toBe(null);
  });

  it.each([
    [{ ...task, assignee_id: "sam" }, "not_mine"],
    [{ ...task, stored_status: "COMPLETED" }, "done"],
    [{ ...task, due_date: null }, "no_due"],
    [{ ...task, fixed_deadline: true }, "fixed"],
    [{ ...task, extension: { status: "pending" } }, "waiting"],
    [{ ...task, extension_requests_blocked: true }, "blocked"],
  ] as const)("refuses %o as %s", (input, why) => {
    expect(cantAskForMoreTime(input, "me")).toBe(why);
  });

  it("lets them ask again once a request is decided", () => {
    expect(
      cantAskForMoreTime({ ...task, extension: { status: "declined" } }, "me"),
    ).toBe(null);
  });
});
