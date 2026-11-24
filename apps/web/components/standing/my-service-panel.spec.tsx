import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/*
 * Your service hours on your own Profile (#5950), through `useMyServiceLog`:
 * whose entries the panel reads, and where Withdraw may appear. Withdraw
 * deletes, and `DELETE /v1/service-entries/:id` accepts `service:approve` as
 * well as `service:log` (the service refuses a foreign entry only when
 * `!isAdmin`), so a reviewer shown another member's pending entry here could
 * delete it and its proof from a list headed as their own.
 */

const PENDING_ENTRY = {
  id: "svc-1",
  chapter_id: "chap-1",
  user_id: "u-1",
  date: "2026-08-01",
  duration_minutes: 120,
  description: "Soup kitchen shift",
  proof_path: "chap-1/svc-1.jpg",
  status: "PENDING" as const,
  reviewed_by: null,
  review_comment: null,
  points_awarded: false,
  created_at: "2026-08-01T00:00:00Z",
};

const APPROVED_ENTRY = {
  ...PENDING_ENTRY,
  id: "svc-2",
  description: "Highway cleanup",
  proof_path: null,
  status: "APPROVED" as const,
  points_awarded: true,
  awarded_points: 2,
};

// Another member's pending entry, the one Withdraw must never reach.
const OTHERS_PENDING = {
  ...PENDING_ENTRY,
  id: "svc-9",
  user_id: "u-2",
  description: "Someone else's shift",
};

const mocks = vi.hoisted(() => ({
  viewer: { userId: "u-1" as string | null, isLoading: false },
  permissions: ["service:log"] as string[],
  entryReads: [] as [string | undefined, unknown, { enabled?: boolean }?][],
  // What the server hands back for a read. The default honors the scope: a
  // `userId` narrows to that member; none is every member's rows, which is
  // what an approver's unscoped read returns.
  rows: [] as { user_id: string }[],
  ignoresScope: false,
  deleteEntry: vi.fn(() => Promise.resolve()),
  blocked: false,
  setLogOpen: vi.fn(),
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useMyPermissions: () => ({ data: { permissions: mocks.permissions } }),
  useServiceEntries: (
    userId: string | undefined,
    status: unknown,
    options?: { enabled?: boolean },
  ) => {
    mocks.entryReads.push([userId, status, options]);
    if (options?.enabled === false) {
      return { data: undefined, isError: false, refetch: vi.fn() };
    }
    return {
      data:
        userId === undefined || mocks.ignoresScope
          ? mocks.rows
          : mocks.rows.filter((row) => row.user_id === userId),
      isError: false,
      refetch: vi.fn(),
    };
  },
  useDeleteServiceEntry: () => ({ mutateAsync: mocks.deleteEntry }),
  useServiceSemesterStart: () => ({
    start: null,
    isError: false,
    refetch: vi.fn(),
  }),
}));

// `useFrappUser` reads its own module's hooks; the viewer is what matters.
vi.mock("@/lib/auth/use-frapp-user", () => ({
  useFrappUser: () => mocks.viewer,
}));
vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/shared/subscription-gate", () => ({
  SubscriptionNotice: () => null,
  useSubscriptionGate: () => ({
    allowed: !mocks.blocked,
    controlProps: () =>
      mocks.blocked
        ? { disabled: true, "aria-describedby": "subscription-notice" }
        : {},
  }),
  useGatedDialog: () => ({
    open: false,
    setOpen: mocks.setLogOpen,
    contentProps: {},
  }),
}));

// The log form has its own spec; the panel's job is offering its trigger.
vi.mock("@/components/service/log-hours-dialog", () => ({
  LogHoursDialog: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));

// The panel's shell is `Panel`'s; here it only has to draw its parts.
vi.mock("./standing-panel-frame", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./standing-panel-frame")>()),
  StandingPanelFrame: ({
    title,
    actions,
    children,
  }: {
    title: string;
    actions?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <section aria-label={title}>
      <header>{actions}</header>
      {children}
    </section>
  ),
}));

import { MyServicePanel } from "./my-service-panel";

const withdrawButtons = () =>
  screen.queryAllByRole("button", { name: /withdraw/i });
const yourLog = () => screen.getByRole("list", { name: "Your log" });

beforeEach(() => {
  mocks.viewer = { userId: "u-1", isLoading: false };
  mocks.permissions = ["service:log"];
  mocks.entryReads = [];
  mocks.rows = [PENDING_ENTRY, APPROVED_ENTRY, OTHERS_PENDING];
  mocks.ignoresScope = false;
  mocks.deleteEntry.mockClear();
  mocks.blocked = false;
});

describe("MyServicePanel: the read is the viewer's own (#4669)", () => {
  it("scopes the read to the viewer's id, even for an approver", () => {
    // Unscoped, `GET /v1/service-entries` hands a `service:approve` holder
    // every member's entries, capped at 1,000 rows, so an officer's older
    // entries would fall off their own log and totals.
    mocks.permissions = ["service:log", "service:approve"];
    render(<MyServicePanel onClose={() => {}} />);

    const enabled = mocks.entryReads.filter(
      ([, , options]) => options?.enabled !== false,
    );
    expect(enabled.length).toBeGreaterThan(0);
    for (const read of enabled) {
      expect(read).toEqual(["u-1", undefined, { enabled: true }]);
    }
    expect(within(yourLog()).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText("Someone else's shift")).toBeNull();
  });
});

describe("MyServicePanel: Withdraw is the submitter's own", () => {
  it("offers Withdraw on the viewer's own pending entry, and nowhere else", () => {
    render(<MyServicePanel onClose={() => {}} />);

    const rows = within(yourLog()).getAllByRole("listitem");
    const pending = rows.find((row) =>
      row.textContent?.includes("Soup kitchen shift"),
    )!;
    const approved = rows.find((row) =>
      row.textContent?.includes("Highway cleanup"),
    )!;
    expect(
      within(pending).getByRole("button", { name: "Withdraw" }),
    ).toBeEnabled();
    expect(within(approved).queryByRole("button", { name: "Withdraw" })).toBeNull();
    expect(withdrawButtons()).toHaveLength(1);
  });

  it("withdraws the entry it sits on, once confirmed", async () => {
    const user = userEvent.setup();
    render(<MyServicePanel onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Withdraw" }));
    await user.click(
      await screen.findByRole("button", { name: "Withdraw entry" }),
    );
    expect(mocks.deleteEntry).toHaveBeenCalledWith("svc-1");
  });

  it("gates Withdraw with the rest of the writes", () => {
    mocks.blocked = true;
    render(<MyServicePanel onClose={() => {}} />);

    const withdraw = screen.getByRole("button", { name: "Withdraw" });
    expect(withdraw).toBeDisabled();
    expect(withdraw).toHaveAttribute(
      "aria-describedby",
      "subscription-notice",
    );
  });

  it("shows Withdraw on nobody else's entry, however privileged", () => {
    // A read that came back with another member's row (a server that dropped
    // the scope) must still not put it on the viewer's own list.
    mocks.permissions = ["service:log", "service:approve", "members:view"];
    mocks.viewer = { userId: "admin-9", isLoading: false };
    mocks.ignoresScope = true;
    render(<MyServicePanel onClose={() => {}} />);

    expect(screen.queryByText("Soup kitchen shift")).toBeNull();
    expect(screen.queryByText("Someone else's shift")).toBeNull();
    expect(withdrawButtons()).toHaveLength(0);
    expect(
      screen.getByText(/^You haven't logged any service yet\./),
    ).toBeInTheDocument();
  });
});

describe("MyServicePanel: while the viewer's id is unknown (#1346)", () => {
  it("shows an approver no list while the viewer is resolving, and says that is why", () => {
    mocks.permissions = ["service:log", "service:approve"];
    mocks.viewer = { userId: null, isLoading: true };
    render(<MyServicePanel onClose={() => {}} />);

    expect(screen.queryByRole("list", { name: "Your log" })).toBeNull();
    expect(screen.queryByText("Soup kitchen shift")).toBeNull();
    expect(withdrawButtons()).toHaveLength(0);
    expect(screen.getByText("Confirming your account…")).toBeInTheDocument();
    // No unscoped read for an approver: it would be everyone's entries.
    expect(
      mocks.entryReads.every(([, , options]) => options?.enabled === false),
    ).toBe(true);
  });

  it("explains an approver's failed id instead of silently dropping the log", () => {
    // `useViewerUserId` reports a failed `/v1/users/me` as `null`, the same
    // value it means by "pending".
    mocks.permissions = ["service:log", "service:approve"];
    mocks.viewer = { userId: null, isLoading: false };
    render(<MyServicePanel onClose={() => {}} />);

    expect(screen.queryByRole("list", { name: "Your log" })).toBeNull();
    expect(withdrawButtons()).toHaveLength(0);
    expect(
      screen.getByText(
        /couldn't confirm your account, so your hours and withdrawing are unavailable/i,
      ),
    ).toBeInTheDocument();
  });

  it("keeps a member's own log, read-only, when only their id failed to load", () => {
    // A member without `service:approve` has an unscoped read the server pins
    // to them, so their entries are honest without their id; only Withdraw,
    // which deletes by id, goes.
    mocks.rows = [PENDING_ENTRY, APPROVED_ENTRY];
    mocks.viewer = { userId: null, isLoading: false };
    render(<MyServicePanel onClose={() => {}} />);

    expect(mocks.entryReads).toContainEqual([
      undefined,
      undefined,
      { enabled: true },
    ]);
    const log = yourLog();
    expect(within(log).getByText("Soup kitchen shift")).toBeInTheDocument();
    expect(within(log).getByText("Highway cleanup")).toBeInTheDocument();
    expect(withdrawButtons()).toHaveLength(0);
    expect(
      screen.getByText(/couldn't confirm your account, so withdrawing is unavailable/i),
    ).toBeInTheDocument();
  });
});

describe("New's Log hours (#5946, #5950)", () => {
  beforeEach(() => {
    mocks.viewer = { userId: "u-1", isLoading: false };
    mocks.permissions = ["service:log"];
    mocks.rows = [];
    mocks.blocked = false;
    mocks.setLogOpen.mockClear();
  });

  it("opens the form when New sent the member here, and takes the mark off", () => {
    window.history.replaceState(null, "", "/profile?open=service&new=1");
    render(<MyServicePanel onClose={() => {}} />);
    expect(mocks.setLogOpen).toHaveBeenCalledWith(true);
    expect(window.location.search).toBe("?open=service");
  });

  it("opens nothing on a plain visit, or while the chapter can't log", () => {
    window.history.replaceState(null, "", "/profile?open=service");
    render(<MyServicePanel onClose={() => {}} />);
    expect(mocks.setLogOpen).not.toHaveBeenCalled();
    mocks.blocked = true;
    window.history.replaceState(null, "", "/profile?open=service&new=1");
    render(<MyServicePanel onClose={() => {}} />);
    expect(mocks.setLogOpen).not.toHaveBeenCalled();
    window.history.replaceState(null, "", "/");
  });
});
