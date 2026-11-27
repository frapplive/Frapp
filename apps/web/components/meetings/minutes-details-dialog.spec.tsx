import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MINUTES_READ_COPY } from "@repo/validation";
import type { MeetingMinutes } from "@repo/hooks";

const copy = MINUTES_READ_COPY.details;

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  event: { data: undefined as unknown, isError: false },
}));

vi.mock("@repo/hooks", () => ({
  useEvent: () => mocks.event,
  useRoles: () => ({ data: [] }),
  useRoleTiers: () => ({ data: [] }),
  useUpdateEvent: () => ({ mutateAsync: mocks.update, isPending: false }),
}));

vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const { MinutesDetailsDialog } = await import("./minutes-details-dialog");

const meeting = {
  id: "m-1",
  event_id: "e-1",
  event_name: "Formal recruitment",
  event_start_time: "2026-12-01T05:00:00.000Z",
  event_end_time: "2026-12-04T05:00:00.000Z",
} as unknown as MeetingMinutes;

function renderDialog() {
  render(
    <MinutesDetailsDialog
      meeting={meeting}
      open
      onOpenChange={() => {}}
      type={{ meeting_type: "chapter", other_label: "" }}
      canEditEvent
      onSaveType={async () => true}
      onEventSaved={() => {}}
    />,
  );
}

/**
 * Edit details on a meeting's minutes (#5562): the name and time belong to
 * its event. An all-day or time-TBD event (#6098) has no time to edit, and a
 * time sent with a rename would make it timed.
 */
describe("MinutesDetailsDialog", () => {
  beforeEach(() => {
    mocks.update.mockReset().mockResolvedValue({});
  });

  it("renames a dated event with its name alone, showing no times", async () => {
    mocks.event = {
      data: {
        id: "e-1",
        timing: "all_day",
        start_date: "2026-12-01",
        end_date: "2026-12-03",
      },
      isError: false,
    };
    renderDialog();
    expect(screen.queryByLabelText(copy.starts)).toBeNull();
    fireEvent.change(screen.getByLabelText(copy.name), {
      target: { value: "Spring recruitment" },
    });
    fireEvent.click(screen.getByRole("button", { name: copy.save }));
    await vi.waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update.mock.calls[0]![0].body).toEqual({
      name: "Spring recruitment",
    });
  });

  it("still edits a timed event's times", () => {
    mocks.event = { data: { id: "e-1", timing: "timed" }, isError: false };
    renderDialog();
    expect(screen.getByLabelText(copy.starts)).toBeTruthy();
  });
});
