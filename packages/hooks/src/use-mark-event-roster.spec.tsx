import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.fn();
const byHand = vi.fn();
vi.mock("./use-attendance", () => ({
  useUpdateAttendanceStatus: () => ({ mutateAsync: update }),
  useMarkAttendanceByHand: () => ({ mutateAsync: byHand }),
}));

const { useMarkEventRosterRow } = await import("./use-mark-event-roster");

const withRow = {
  userId: "u-1",
  displayName: "Ava Brooks",
  attendanceId: "att-1",
};
const noRow = { userId: "u-2", displayName: "Marcus Lee", attendanceId: null };

function markRow() {
  return renderHook(() => useMarkEventRosterRow("evt-1")).result.current;
}

describe("useMarkEventRosterRow", () => {
  beforeEach(() => {
    update.mockReset().mockResolvedValue({});
    byHand.mockReset();
  });

  it("changes a row that exists in place", async () => {
    await markRow()(withRow, "LATE");
    expect(update).toHaveBeenCalledWith({
      eventId: "evt-1",
      userId: "u-1",
      body: { status: "LATE" },
    });
    expect(byHand).not.toHaveBeenCalled();
  });

  // The PATCH 404s without a row: the "Not here" rows during check-in.
  it("records a member with no row by hand", async () => {
    byHand.mockResolvedValue({
      marked: ["u-2"],
      already_marked: 0,
      not_invited: 0,
    });
    await markRow()(noRow, "PRESENT");
    expect(byHand).toHaveBeenCalledWith({
      eventId: "evt-1",
      userIds: ["u-2"],
      status: "PRESENT",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("changes the row when they checked in since the roster was read", async () => {
    byHand.mockResolvedValue({ marked: [], already_marked: 1, not_invited: 0 });
    await markRow()(noRow, "LATE");
    expect(update).toHaveBeenCalledWith({
      eventId: "evt-1",
      userId: "u-2",
      body: { status: "LATE" },
    });
  });

  it("says so when the server leaves the member out", async () => {
    byHand.mockResolvedValue({ marked: [], already_marked: 0, not_invited: 1 });
    await expect(markRow()(noRow, "PRESENT")).rejects.toThrow(
      "Marcus Lee isn't on this event's list.",
    );
  });
});
