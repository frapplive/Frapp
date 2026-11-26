// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TASK_EXTENSION_COPY,
  TASK_EXTENSION_NEEDS_OFFICER_LABELS,
} from "@repo/validation";
import type { ActivityTaskExtension } from "@repo/hooks";

const state = vi.hoisted(() => ({
  approve: vi.fn(),
  decline: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useApproveTaskExtension: () => ({ mutate: state.approve, isPending: false }),
  useDeclineTaskExtension: () => ({
    mutateAsync: state.decline,
    isPending: false,
  }),
  useNow: () => new Date("2026-11-26T12:00:00").getTime(),
}));
vi.mock("@/components/shared/subscription-gate", () => ({
  SubscriptionNotice: () => null,
  useSubscriptionGate: () => ({ controlProps: () => ({}) }),
}));
vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: state.toast }),
}));

const { ExtensionReview } = await import("./extension-review");

const request = (over: Partial<ActivityTaskExtension> = {}) =>
  ({
    id: "req-1",
    task: { id: "task-1", title: "Sweep the porch", assignee_id: "member-1" },
    requester_name: "Sam Lee",
    reason: "Shift ran late",
    from_due_date: "2026-11-27",
    from_due_at: null,
    to_due_date: "2026-11-30",
    to_due_at: null,
    needs_officer: "over_a_day",
    ai_verdict: null,
    ai_note: null,
    created_at: "2026-11-26T10:00:00Z",
    ...over,
  }) as ActivityTaskExtension;

beforeEach(() => {
  state.approve.mockReset();
  state.decline.mockReset();
  state.toast.mockReset();
});

describe("ExtensionReview (#6096)", () => {
  it("shows who asks, the task, from and to, why, and the reason", () => {
    render(
      <ExtensionReview extension={request()} face={null} onDone={vi.fn()} />,
    );
    expect(screen.getByText("Sam Lee asks for more time")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Sweep the porch" }),
    ).toHaveAttribute("href", "/activity?task=task-1");
    expect(
      screen.getByLabelText("From tomorrow to Monday"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(TASK_EXTENSION_NEEDS_OFFICER_LABELS.over_a_day),
    ).toBeInTheDocument();
    expect(screen.getByText(/Shift ran late/)).toBeInTheDocument();
    expect(screen.queryByText(/Frapp Intelligence/)).toBeNull();
  });

  it("shows AI's note only when it judged the reason invalid", () => {
    render(
      <ExtensionReview
        extension={request({
          needs_officer: "reason_invalid",
          ai_verdict: "invalid",
          ai_note: "The reason doesn't say what got in the way.",
        })}
        face={null}
        onDone={vi.fn()}
      />,
    );
    expect(
      screen.getByText("The reason doesn't say what got in the way."),
    ).toBeInTheDocument();
  });

  it("approves, then hands back to the list", () => {
    const onDone = vi.fn();
    state.approve.mockImplementation((_ids, { onSuccess }) => onSuccess());
    render(
      <ExtensionReview extension={request()} face={null} onDone={onDone} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: TASK_EXTENSION_COPY.approve }),
    );
    expect(state.approve.mock.calls[0]?.[0]).toEqual({
      taskId: "task-1",
      requestId: "req-1",
    });
    expect(onDone).toHaveBeenCalled();
  });

  it("says a 409 in the server's words and re-reads", () => {
    const onDone = vi.fn();
    state.approve.mockImplementation((_ids, { onError }) =>
      onError({
        statusCode: 409,
        message: "Someone already answered this request.",
      }),
    );
    render(
      <ExtensionReview extension={request()} face={null} onDone={onDone} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: TASK_EXTENSION_COPY.approve }),
    );
    expect(state.toast.mock.calls[0]?.[0].description).toBe(
      "Someone already answered this request.",
    );
    expect(onDone).toHaveBeenCalled();
  });

  it("declines with a required reason", async () => {
    const onDone = vi.fn();
    state.decline.mockResolvedValue({});
    render(
      <ExtensionReview extension={request()} face={null} onDone={onDone} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: TASK_EXTENSION_COPY.decline }),
    );
    const dialog = await screen.findByRole("dialog");
    const submit = () =>
      fireEvent.click(
        Array.from(dialog.querySelectorAll("button")).find(
          (button) => button.textContent === TASK_EXTENSION_COPY.decline,
        )!,
      );
    submit();
    expect(
      await screen.findByText("Say why it can't move."),
    ).toBeInTheDocument();
    expect(state.decline).not.toHaveBeenCalled();
    fireEvent.change(
      screen.getByLabelText(TASK_EXTENSION_COPY.declineReasonLabel),
      { target: { value: "The event is Friday" } },
    );
    submit();
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(state.decline).toHaveBeenCalledWith({
      taskId: "task-1",
      requestId: "req-1",
      reason: "The event is Friday",
    });
  });
});
