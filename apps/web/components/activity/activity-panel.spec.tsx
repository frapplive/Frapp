import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityRow } from "@repo/hooks";

/*
 * The panel around chat's own cards: what it adds beside a card. The cards
 * themselves are chat's and are tested there, so they are stubbed here.
 */

vi.mock("@/components/chat/renderers/event-card", () => ({
  EventCard: () => <div data-testid="event-card" />,
}));
vi.mock("@/components/chat/renderers/hours-card", () => ({
  HoursCard: () => null,
}));
vi.mock("@/components/chat/renderers/poll-card", () => ({
  PollCard: () => null,
}));
vi.mock("@/components/chat/renderers/task-card", () => ({
  TaskCard: () => <div data-testid="task-card" />,
}));
vi.mock("@/components/tasks/task-review", () => ({
  TaskReview: ({
    taskId,
    waitingAfter,
    onDone,
  }: {
    taskId: string;
    waitingAfter?: number;
    onDone: () => void;
  }) => (
    <div data-testid="task-review">
      {taskId}:{waitingAfter ?? 0}
      <button type="button" onClick={onDone}>
        done
      </button>
    </div>
  ),
}));
vi.mock("@/components/service/use-service-review", () => ({
  useServiceReview: () => ({
    approve: () => Promise.resolve(false),
    reject: () => Promise.resolve(false),
    isPending: false,
    confirmDialog: null,
  }),
}));

// What an hours review reads beside chat's card (#5950): the chapter's rate,
// the live entry's proof path, and the proof opener. `approvePointsPreview`
// runs for real, so the line asserted is the one the panel builds.
const hours = vi.hoisted(() => ({
  rate: undefined as { minutes_per_point: number } | undefined,
  proofPath: "chap-1/svc-1.jpg" as string | null,
  viewProof: vi.fn(),
  // The gate's verdict for this test: blocked hands every gated control
  // `disabled` and the notice's id, as `useSubscriptionGate` does.
  blocked: false,
}));
vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useServicePointsRate: () => ({ data: hours.rate }),
  useServiceEntry: () => ({ data: { proof_path: hours.proofPath } }),
}));
vi.mock("@/components/service/use-view-service-proof", () => ({
  useViewServiceProof: () => ({ viewProof: hours.viewProof, isPending: false }),
}));
vi.mock("@/components/shared/subscription-gate", () => ({
  SubscriptionNotice: () => null,
  useSubscriptionGate: () => ({
    controlProps: () =>
      hours.blocked
        ? { disabled: true, "aria-describedby": "subscription-notice" }
        : {},
  }),
}));
vi.mock("./use-activity-poll", () => ({ useActivityPoll: () => ({}) }));

import { ActivityPanel } from "./activity-panel";

const eventRow = {
  kind: "event",
  key: "made:event:evt-9",
  title: "Spring formal",
  detail: "",
  badge: null,
  event: {
    id: "evt-9",
    name: "Spring formal",
    location: "Hotel",
    start_time: "2099-12-05T01:00:00.000Z",
    end_time: "2099-12-05T05:00:00.000Z",
    attendance: "optional",
    point_value: 10,
    check_in_opens_minutes: 10,
    check_in_open: false,
    checked_in: null,
  },
} as unknown as ActivityRow;

describe("ActivityPanel: an event", () => {
  it("draws chat's event card and links to the event on the Events page", () => {
    render(
      <ActivityPanel
        row={eventRow}
        viewerId="user-1"
        onClose={() => {}}
        onActed={() => {}}
      />,
    );

    expect(screen.getByTestId("event-card")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open in Events" }).getAttribute("href"),
    ).toBe("/events?event=evt-9");
  });
});

describe("ActivityPanel docked (#4593)", () => {
  it("opens in place of the Activity page beside chat, and goes back with the arrow", () => {
    const onClose = vi.fn();
    render(
      <div data-tool-column="">
        <div data-tool-page="" />
        <ActivityPanel
          row={eventRow}
          viewerId="user-1"
          onClose={onClose}
          onActed={() => {}}
        />
      </div>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    const region = screen.getByRole("region", { name: "Event" });
    expect(region.parentElement).toHaveAttribute("data-tool-column");
    fireEvent.click(screen.getByRole("button", { name: "Back to activity" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("ActivityPanel: a task (#4693)", () => {
  const taskRow = (glyph: "confirm" | "task") =>
    ({
      kind: "task",
      key: `needs:task:task-1`,
      title: "Clean his room",
      detail: "",
      badge: null,
      glyph,
      task: {
        id: "task-1",
        title: "Clean his room",
        assignee_id: "user-1",
        assignee_name: "Shawn Klein",
        created_by: "admin-1",
        created_by_name: "Paul Carlson",
        due_date: "2099-11-05",
        due_at: null,
        status: "COMPLETED",
        stored_status: "COMPLETED",
        point_reward: 10,
        completed_at: null,
        confirmed_at: null,
      },
    }) as unknown as ActivityRow;

  it("opens a task waiting on the viewer's sign-off as its review", () => {
    render(
      <ActivityPanel
        row={taskRow("confirm")}
        viewerId="admin-1"
        onClose={() => {}}
        onActed={() => {}}
      />,
    );
    expect(screen.getByText("Review task")).toBeTruthy();
    expect(screen.getByTestId("task-review").textContent).toContain("task-1:0");
    expect(screen.queryByTestId("task-card")).toBeNull();
  });

  it("opens the next waiting review once this one is done, else closes", () => {
    const next = { ...taskRow("confirm"), key: "needs-confirm:task:task-2" };
    const open = vi.fn();
    const onClose = vi.fn();
    const onActed = vi.fn();
    const { rerender } = render(
      <ActivityPanel
        row={taskRow("confirm")}
        viewerId="admin-1"
        onClose={onClose}
        onActed={onActed}
        reviewQueue={{ after: () => [next], open }}
      />,
    );
    expect(screen.getByTestId("task-review").textContent).toContain("task-1:1");
    fireEvent.click(screen.getByRole("button", { name: "done" }));
    expect(onActed).toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(next);
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <ActivityPanel
        row={taskRow("confirm")}
        viewerId="admin-1"
        onClose={onClose}
        onActed={onActed}
        reviewQueue={{ after: () => [], open }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "done" }));
    expect(onClose).toHaveBeenCalledWith("needs:task:task-1");
  });

  it("opens any other task as chat's card", () => {
    render(
      <ActivityPanel
        row={taskRow("task")}
        viewerId="user-1"
        onClose={() => {}}
        onActed={() => {}}
      />,
    );
    expect(screen.getByTestId("task-card")).toBeTruthy();
    expect(screen.queryByTestId("task-review")).toBeNull();
  });
});

describe("ActivityPanel: service hours to review (#5950)", () => {
  // 2h, so the chapter's default rate of 1 per hour awards 2.
  const hoursRow = {
    kind: "hours",
    key: "needs:hours:svc-1",
    title: "Soup kitchen shift",
    detail: "",
    badge: null,
    glyph: "hours",
    entry: {
      id: "svc-1",
      user_id: "u-1",
      member_name: "Shawn Klein",
      date: "2026-08-01",
      duration_minutes: 120,
      description: "Soup kitchen shift",
      created_at: "2026-08-01T00:00:00Z",
      unread: false,
    },
  } as unknown as ActivityRow;

  const renderHours = () =>
    render(
      <ActivityPanel
        row={hoursRow}
        viewerId="admin-9"
        onClose={() => {}}
        onActed={() => {}}
      />,
    );

  beforeEach(() => {
    hours.rate = undefined;
    hours.proofPath = "chap-1/svc-1.jpg";
    hours.viewProof.mockClear();
    hours.blocked = false;
  });

  it("says how many points Approve awards at the chapter's rate", () => {
    hours.rate = { minutes_per_point: 60 };
    renderHours();

    expect(
      screen.getByText(
        "Approving awards 2 service points, at the chapter's current rate of 1 per hour.",
      ),
    ).toBeInTheDocument();
  });

  it("says plainly when the entry is under the rate", () => {
    hours.rate = { minutes_per_point: 180 };
    renderHours();

    expect(
      screen.getByText(
        "Approving awards no points: 2h is under the chapter's current rate of 1 point per 3h.",
      ),
    ).toBeInTheDocument();
  });

  it("states no number when the rate couldn't be read", () => {
    renderHours();

    expect(screen.queryByText(/approving awards/i)).toBeNull();
    // The proof link still has its place without the line.
    expect(screen.getByRole("button", { name: "View proof" })).toBeEnabled();
  });

  it("opens the entry's own proof", () => {
    renderHours();

    fireEvent.click(screen.getByRole("button", { name: "View proof" }));
    expect(hours.viewProof).toHaveBeenCalledWith("svc-1");
  });

  it("offers no proof link for an entry without proof", () => {
    hours.proofPath = null;
    renderHours();

    expect(screen.queryByRole("button", { name: "View proof" })).toBeNull();
  });

  it("never gates reading a proof", () => {
    // The signed link comes from `GET /v1/service-entries/:id/proof-url`, and
    // `enforceSubscription` returns early for GET, so a chapter whose plan
    // blocks writes still reads the proof it is deciding by.
    hours.blocked = true;
    renderHours();

    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
    const view = screen.getByRole("button", { name: "View proof" });
    expect(view).toBeEnabled();
    expect(view).not.toHaveAttribute("aria-describedby");
    fireEvent.click(view);
    expect(hours.viewProof).toHaveBeenCalledWith("svc-1");
  });
});
