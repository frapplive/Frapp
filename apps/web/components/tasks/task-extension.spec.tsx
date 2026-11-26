// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TASK_EXTENSION_COPY } from "@repo/validation";

const state = vi.hoisted(() => ({
  request: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useRequestTaskExtension: () => ({
    mutateAsync: state.request,
    isPending: false,
  }),
}));
vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: state.toast }),
}));

const { AskForMoreTimeDialog, extensionDueBody, taskExtensionView } =
  await import("./task-extension");
import type { BoardTask } from "./board-task";

const NOW = new Date("2026-11-26T12:00:00");

function task(over: Partial<BoardTask> = {}): BoardTask {
  return {
    id: "task-1",
    chapter_id: "c",
    title: "Sweep the porch",
    description: null,
    assignee_id: "me",
    created_by: "officer",
    due_date: "2026-11-27",
    status: "TODO",
    stored_status: "TODO",
    point_reward: null,
    points_awarded: false,
    completed_at: null,
    confirmed_at: null,
    created_at: "2026-11-20T00:00:00Z",
    ...over,
  };
}

const extension = (over: Record<string, unknown> = {}) =>
  ({
    id: "req-1",
    status: "approved",
    reason: "Shift ran late",
    from_due_date: "2026-11-27",
    from_due_at: null,
    to_due_date: "2026-11-28",
    to_due_at: null,
    needs_officer: null,
    auto_approved: true,
    decline_reason: null,
    decided_at: "2026-11-26T10:00:00Z",
    created_at: "2026-11-26T10:00:00Z",
    ...over,
  }) as BoardTask["extension"];

describe("taskExtensionView (#6096)", () => {
  it("lets the assignee of an open, dated task ask", () => {
    const view = taskExtensionView(task(), {
      viewerId: "me",
      canManage: false,
      now: NOW,
    });
    expect(view).toEqual({ cant: null, urgent: false, lines: [] });
  });

  it("reads a fixed deadline urgent to its assignee, with its words", () => {
    const view = taskExtensionView(task({ fixed_deadline: true }), {
      viewerId: "me",
      canManage: false,
      now: NOW,
    });
    expect(view.urgent).toBe(true);
    expect(view.lines).toEqual([
      { text: TASK_EXTENSION_COPY.fixedNoExtensions, tone: "danger" },
    ]);
    // Not urgent to anyone else.
    expect(
      taskExtensionView(task({ fixed_deadline: true }), {
        viewerId: "officer",
        canManage: true,
        now: NOW,
      }).urgent,
    ).toBe(false);
  });

  it("says a waiting request and a block in the action's place", () => {
    expect(
      taskExtensionView(
        task({ extension: extension({ status: "pending", decided_at: null }) }),
        { viewerId: "me", canManage: false, now: NOW },
      ).lines.map((line) => line.text),
    ).toEqual([TASK_EXTENSION_COPY.waiting]);
    expect(
      taskExtensionView(task({ extension_requests_blocked: true }), {
        viewerId: "me",
        canManage: false,
        now: NOW,
      }).lines.map((line) => line.text),
    ).toEqual([TASK_EXTENSION_COPY.blocked]);
  });

  it("says the answer to the assignee and officers, never anyone else", () => {
    const approved = task({ extension: extension() });
    expect(
      taskExtensionView(approved, {
        viewerId: "me",
        canManage: false,
        now: NOW,
      }).lines[0]?.text,
    ).toBe("Extended to Saturday · approved automatically");
    expect(
      taskExtensionView(approved, {
        viewerId: "officer",
        canManage: true,
        now: NOW,
      }).lines[0]?.text,
    ).toBe("Extended to Saturday · approved automatically");
    expect(
      taskExtensionView(approved, {
        viewerId: "follower",
        canManage: false,
        now: NOW,
      }).lines,
    ).toEqual([]);
    const declined = task({
      extension: extension({
        status: "declined",
        auto_approved: false,
        decline_reason: "The event is Friday",
      }),
    });
    expect(
      taskExtensionView(declined, {
        viewerId: "me",
        canManage: false,
        now: NOW,
      }).lines[0]?.text,
    ).toBe("Not extended: The event is Friday");
  });
});

describe("extensionDueBody", () => {
  it("sends a day alone for a task due by a day", () => {
    expect(extensionDueBody(task(), "2026-11-28")).toEqual({
      due_date: "2026-11-28",
    });
  });

  it("keeps a time for a task due at one", () => {
    const timed = task({
      due_at: new Date(2026, 10, 27, 17, 0).toISOString(),
    });
    expect(extensionDueBody(timed, "2026-11-28")).toEqual({
      due_date: "2026-11-28",
      due_at: new Date(2026, 10, 28, 17, 0).toISOString(),
    });
    expect(extensionDueBody(timed, "2026-11-28T09:30")).toEqual({
      due_date: "2026-11-28",
      due_at: new Date(2026, 10, 28, 9, 30).toISOString(),
    });
  });
});

describe("AskForMoreTimeDialog", () => {
  beforeEach(() => {
    state.request.mockReset();
    state.toast.mockReset();
  });

  function open(onClose = vi.fn()) {
    render(<AskForMoreTimeDialog task={task()} open onClose={onClose} />);
    return onClose;
  }

  it("needs a reason before it sends", async () => {
    open();
    fireEvent.change(screen.getByLabelText(TASK_EXTENSION_COPY.newDue), {
      target: { value: "December 30" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: TASK_EXTENSION_COPY.send }),
    );
    expect(
      await screen.findByText("Say why you need more time."),
    ).toBeInTheDocument();
    expect(state.request).not.toHaveBeenCalled();
    expect(screen.getByText(TASK_EXTENSION_COPY.hint)).toBeInTheDocument();
  });

  it("toasts More time granted, and the block when it was the third", async () => {
    state.request.mockResolvedValue({
      extension: extension({ to_due_date: "2026-12-30" }),
      now_blocked: true,
    });
    const onClose = open();
    fireEvent.change(screen.getByLabelText(TASK_EXTENSION_COPY.newDue), {
      target: { value: "December 30" },
    });
    fireEvent.blur(screen.getByLabelText(TASK_EXTENSION_COPY.newDue));
    fireEvent.change(screen.getByLabelText(TASK_EXTENSION_COPY.reasonLabel), {
      target: { value: "  Shift ran late " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: TASK_EXTENSION_COPY.send }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(state.request).toHaveBeenCalledWith({
      id: "task-1",
      body: {
        due_date: expect.stringMatching(/-12-30$/),
        reason: "Shift ran late",
      },
    });
    const shown = state.toast.mock.calls[0]?.[0];
    expect(shown.title).toBe(TASK_EXTENSION_COPY.approvedNow);
    expect(shown.description).toContain(TASK_EXTENSION_COPY.blocked);
  });

  it("says the server's refusal in the dialog", async () => {
    state.request.mockRejectedValue({
      statusCode: 409,
      code: "task.extension_waiting",
      message: "You already asked for more time on this task.",
    });
    open();
    fireEvent.change(screen.getByLabelText(TASK_EXTENSION_COPY.newDue), {
      target: { value: "December 30" },
    });
    fireEvent.blur(screen.getByLabelText(TASK_EXTENSION_COPY.newDue));
    fireEvent.change(screen.getByLabelText(TASK_EXTENSION_COPY.reasonLabel), {
      target: { value: "Shift ran late" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: TASK_EXTENSION_COPY.send }),
    );
    expect(
      await screen.findByText("You already asked for more time on this task."),
    ).toBeInTheDocument();
  });
});
