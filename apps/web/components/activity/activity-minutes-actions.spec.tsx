import { act, renderHook, waitFor } from "@testing-library/react";
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityMinutesMeeting,
  activityToDos,
  type Activity,
} from "@repo/hooks/activity-rows";
import type { MinutesToWriteRow } from "./activity-minutes-actions";

const mockPush = vi.fn();
const mockToast = vi.fn();
const mockStart = vi.fn();
const mockSetNoMinutes = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));
vi.mock("@repo/hooks", () => ({
  activityMinutesMeeting,
  useStartMeeting: () => ({ mutateAsync: mockStart }),
  useSetMeetingNoMinutes: () => ({ mutateAsync: mockSetNoMinutes }),
}));

const { useActivityMinutesActions } =
  await import("./activity-minutes-actions");

/** The Write minutes row the real model draws for a meeting. */
function writeRow(name = "Exec meeting"): MinutesToWriteRow {
  const [todo] = activityToDos({
    needs_you: {
      tasks: [],
      task_confirmations: [],
      hours_approvals: [],
      polls: [],
    },
    coming_up: [],
    links: [],
    minutes: {
      to_write: [
        {
          event_id: "e9",
          name,
          start_time: "2026-11-18T19:00:00.000Z",
          end_time: "2026-11-18T20:00:00.000Z",
        },
      ],
      drafts: [],
      taking_notes: [],
    },
  } as unknown as Activity);
  return todo!.dated as MinutesToWriteRow;
}

const reread = vi.fn(() => Promise.resolve());

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useActivityMinutesActions (#5949)", () => {
  it("starts minutes with the type the name suggests and opens them", async () => {
    mockStart.mockResolvedValue({ id: "m1" });
    const { result } = renderHook(() => useActivityMinutesActions(reread));

    act(() => result.current.write(writeRow()));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/meetings/m1"));
    expect(mockStart).toHaveBeenCalledWith({
      event_id: "e9",
      meeting_type: "exec",
    });
    expect(reread).toHaveBeenCalled();
  });

  it("says minutes someone else started are already started, and reads the list again", async () => {
    mockStart.mockRejectedValue({ code: "meeting.already_started" });
    const { result } = renderHook(() => useActivityMinutesActions(reread));

    act(() => result.current.write(writeRow()));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({
        title: "These minutes are already started",
        description:
          "Someone else started minutes for this meeting. They show here once they are posted.",
      }),
    );
    expect(reread).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("marks No minutes from the row's menu, with Undo", async () => {
    mockSetNoMinutes.mockResolvedValue(undefined);
    const { result } = renderHook(() => useActivityMinutesActions(reread));
    const [entry] = result.current.entriesFor(writeRow());
    expect(entry).toMatchObject({
      type: "item",
      label: "No minutes for this meeting",
    });

    act(() => {
      if (entry?.type === "item" && entry.onSelect) entry.onSelect();
    });

    expect(mockSetNoMinutes).toHaveBeenCalledWith({
      eventId: "e9",
      noMinutes: true,
    });
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    const shown = mockToast.mock.calls[0]![0] as {
      title: string;
      action: ReactElement<{ onClick: () => void }>;
    };
    expect(shown.title).toBe("Exec meeting marked as no minutes");
    expect(reread).toHaveBeenCalled();

    // Undo takes the mark off again.
    expect(isValidElement(shown.action)).toBe(true);
    act(() => shown.action.props.onClick());
    expect(mockSetNoMinutes).toHaveBeenLastCalledWith({
      eventId: "e9",
      noMinutes: false,
    });
  });

  it("says when the mark couldn't be saved", async () => {
    mockSetNoMinutes.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useActivityMinutesActions(reread));
    const [entry] = result.current.entriesFor(writeRow());

    act(() => {
      if (entry?.type === "item" && entry.onSelect) entry.onSelect();
    });

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Couldn't save that",
          variant: "destructive",
        }),
      ),
    );
  });
});
