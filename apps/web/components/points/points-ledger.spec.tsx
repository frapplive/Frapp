import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatDayTime, formatTimestampFull } from "@repo/formatting";
import { denseListClassName } from "@/components/shared/table-controls";
import { cardFilledContainers } from "@/tests/card-surfaces";
import { AUDIT_PAGE_SIZE, olderAuditCursor } from "./points-ledger";

const MICROSECOND_CURSOR = "2026-03-14T09:08:07.123456+00:00";

const fixtures = vi.hoisted(() => ({
  data: [] as unknown[],
  isPending: false,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
  lastOptions: undefined as
    | {
        userId?: string;
        category?: string;
        flagged?: boolean;
        before?: string;
        limit?: number;
      }
    | undefined,
}));

const perms = vi.hoisted(() => ({ list: ["points:view_all"] as string[] }));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  usePermissionList: () => perms.list,
  useMemberDisplayNames: () => ({
    byId: { "user-1": "Alex" },
    nameFor: (id: string) => (id === "user-1" ? "Alex" : null),
  }),
  useOrgConfig: () => ({
    data: {
      points: {
        anomaly_threshold: 100,
        adjustment_rate_limit_per_hour: 50,
      },
    },
    isSuccess: true,
  }),
  usePointsTransactions: (options?: (typeof fixtures)["lastOptions"]) => {
    fixtures.lastOptions = options;
    return {
      data: fixtures.data,
      isPending: fixtures.isPending,
      isError: fixtures.isError,
      isFetching: fixtures.isFetching,
      refetch: fixtures.refetch,
    };
  },
}));

// The ledger's own writes and dialogs are out of scope here: the adjustment
// form has its own spec.
vi.mock("@/components/points/points-adjustment-dialog", () => ({
  PointsAdjustmentDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Adjust points" /> : null,
}));
vi.mock("@/components/shared/subscription-gate", () => ({
  SubscriptionNotice: () => null,
  useSubscriptionGate: () => ({
    allowed: true,
    state: { allowed: true },
    controlProps: () => ({}),
  }),
  useGatedDialog: () => {
    const [open, setOpen] = React.useState(false);
    return { open, setOpen, contentProps: {} };
  },
}));

const { PointsLedger } = await import("./points-ledger");

function page(
  count: number,
  oldestCreatedAt = MICROSECOND_CURSOR,
): Array<{
  id: string;
  user_id: string;
  amount: number;
  category: "MANUAL";
  created_at?: string;
}> {
  return Array.from({ length: count }, (_, i) => ({
    id: `tx-${i}`,
    user_id: "user-1",
    amount: 1,
    category: "MANUAL" as const,
    created_at:
      i === count - 1
        ? oldestCreatedAt
        : `2026-03-14T10:00:00.${String(i).padStart(6, "0")}Z`,
  }));
}

/** Pick `option` under `group` in the ledger's Filter menu. */
async function pick(
  user: ReturnType<typeof userEvent.setup>,
  group: string,
  option: string,
) {
  await user.click(screen.getByRole("button", { name: /^Filter the ledger/ }));
  screen.getByRole("menuitem", { name: new RegExp(`^${group}`) }).focus();
  await user.keyboard("{ArrowRight}");
  await user.click(await screen.findByRole("menuitemradio", { name: option }));
}

describe("olderAuditCursor", () => {
  it("returns the oldest created_at verbatim on a full page", () => {
    const rows = page(AUDIT_PAGE_SIZE, MICROSECOND_CURSOR);
    expect(olderAuditCursor(rows)).toBe(MICROSECOND_CURSOR);
    // The regression #1832 fixed on the API: Date is millisecond-only.
    expect(olderAuditCursor(rows)).not.toBe(
      new Date(MICROSECOND_CURSOR).toISOString(),
    );
  });

  it("returns undefined when the page is short of the limit", () => {
    expect(olderAuditCursor(page(AUDIT_PAGE_SIZE - 1))).toBeUndefined();
    expect(olderAuditCursor([])).toBeUndefined();
  });

  it("returns undefined when the oldest row has no created_at", () => {
    const rows = page(AUDIT_PAGE_SIZE);
    delete rows[AUDIT_PAGE_SIZE - 1]!.created_at;
    expect(olderAuditCursor(rows)).toBeUndefined();
  });
});

describe("PointsLedger pagination", () => {
  beforeEach(() => {
    fixtures.data = [];
    fixtures.isPending = false;
    fixtures.isError = false;
    fixtures.isFetching = false;
    fixtures.refetch.mockReset();
    fixtures.lastOptions = undefined;
  });

  it("loads the first page with limit 100 and no before cursor", () => {
    fixtures.data = page(AUDIT_PAGE_SIZE);
    render(<PointsLedger />);

    expect(fixtures.lastOptions).toMatchObject({
      limit: AUDIT_PAGE_SIZE,
      before: undefined,
    });
    expect(
      screen.getByRole("button", { name: "Older transactions" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Newer transactions" }),
    ).toBeDisabled();
  });

  it("sends the oldest created_at verbatim as before when paging older", async () => {
    const user = userEvent.setup();
    fixtures.data = page(AUDIT_PAGE_SIZE, MICROSECOND_CURSOR);
    render(<PointsLedger />);

    await user.click(
      screen.getByRole("button", { name: "Older transactions" }),
    );

    expect(fixtures.lastOptions?.before).toBe(MICROSECOND_CURSOR);
    expect(fixtures.lastOptions?.before).not.toBe(
      new Date(MICROSECOND_CURSOR).toISOString(),
    );
  });

  it("returns to the first page without a cursor via Newer transactions", async () => {
    const user = userEvent.setup();
    fixtures.data = page(AUDIT_PAGE_SIZE, MICROSECOND_CURSOR);
    const view = render(<PointsLedger />);

    await user.click(
      screen.getByRole("button", { name: "Older transactions" }),
    );
    expect(fixtures.lastOptions?.before).toBe(MICROSECOND_CURSOR);

    fixtures.data = page(40);
    view.rerender(<PointsLedger />);
    expect(
      screen.getByRole("button", { name: "Older transactions" }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "Newer transactions" }),
    );
    expect(fixtures.lastOptions?.before).toBeUndefined();
  });

  it("says there's nothing older, not that nothing was ever recorded, on an empty older page", async () => {
    const user = userEvent.setup();
    fixtures.data = page(AUDIT_PAGE_SIZE, MICROSECOND_CURSOR);
    const view = render(<PointsLedger />);
    await user.click(
      screen.getByRole("button", { name: "Older transactions" }),
    );
    fixtures.data = [];
    view.rerender(<PointsLedger />);
    expect(screen.getByText("No older transactions.")).toBeInTheDocument();
    expect(screen.queryByText("No points have been recorded yet.")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Newer transactions" }),
    ).toBeEnabled();
  });

  it("keeps Newer available when an older page fails to load", async () => {
    const user = userEvent.setup();
    fixtures.data = page(AUDIT_PAGE_SIZE, MICROSECOND_CURSOR);
    const view = render(<PointsLedger />);

    await user.click(
      screen.getByRole("button", { name: "Older transactions" }),
    );

    fixtures.isError = true;
    fixtures.data = [];
    view.rerender(<PointsLedger />);

    expect(screen.getByText("Ledger unavailable")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Newer transactions" }),
    );

    expect(fixtures.lastOptions?.before).toBeUndefined();
  });

  it("does not offer Older transactions on a short first page", () => {
    fixtures.data = page(3);
    render(<PointsLedger />);

    expect(
      screen.queryByRole("button", { name: "Older transactions" }),
    ).not.toBeInTheDocument();
    expect(fixtures.lastOptions?.before).toBeUndefined();
  });

  it("resets the cursor when the flagged filter changes", async () => {
    const user = userEvent.setup();
    fixtures.data = page(AUDIT_PAGE_SIZE, MICROSECOND_CURSOR);
    render(<PointsLedger />);

    await user.click(
      screen.getByRole("button", { name: "Older transactions" }),
    );
    expect(fixtures.lastOptions?.before).toBe(MICROSECOND_CURSOR);

    await pick(user, "Show", "Flagged only");
    expect(
      screen.getByRole("button", { name: "Filter the ledger, 1 on" }),
    ).toBeInTheDocument();
    expect(fixtures.lastOptions).toMatchObject({
      before: undefined,
      flagged: true,
    });
  });

  it("resets the cursor when the category filter changes", async () => {
    const user = userEvent.setup();
    fixtures.data = page(AUDIT_PAGE_SIZE, MICROSECOND_CURSOR);
    render(<PointsLedger />);

    await user.click(
      screen.getByRole("button", { name: "Older transactions" }),
    );
    expect(fixtures.lastOptions?.before).toBe(MICROSECOND_CURSOR);

    await pick(user, "Category", "Fine");

    expect(fixtures.lastOptions).toMatchObject({
      before: undefined,
      category: "FINE",
    });
  });

  it("resets the cursor when the member filter changes", async () => {
    const user = userEvent.setup();
    fixtures.data = page(AUDIT_PAGE_SIZE, MICROSECOND_CURSOR);
    render(<PointsLedger />);

    await user.click(
      screen.getByRole("button", { name: "Older transactions" }),
    );
    expect(fixtures.lastOptions?.before).toBe(MICROSECOND_CURSOR);

    await pick(user, "Member", "Alex");

    expect(fixtures.lastOptions).toMatchObject({
      before: undefined,
      userId: "user-1",
    });
  });
});

describe("PointsLedger on Chapter settings' Points page", () => {
  beforeEach(() => {
    fixtures.data = [];
    fixtures.isPending = false;
    fixtures.isError = false;
    fixtures.isFetching = false;
    perms.list = ["points:view_all"];
  });

  it("is a flush Ledger section with the chapter's limits as one state line", () => {
    fixtures.data = page(2);
    const { container } = render(<PointsLedger />);

    expect(screen.getByRole("region", { name: "Ledger" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Flags at ±100 points · 50 adjustments per admin per hour",
        {
          exact: false,
        },
      ),
    ).toBeInTheDocument();
    // A moved threshold never re-checks old rows, and the tab says so.
    expect(
      screen.getByText("Each flag keeps the threshold it was raised under."),
    ).toBeInTheDocument();
    // The policy explanation the card used to carry is gone.
    expect(screen.queryByText(/chapter-configurable/)).not.toBeInTheDocument();
    expect(screen.getByRole("list")).toHaveClass(
      ...denseListClassName.split(" "),
    );
    expect(cardFilledContainers(container)).toEqual([]);
  });

  it("labels the category in sentence case and dates the row in the house shape", () => {
    const at = "2026-03-14T17:00:00Z";
    fixtures.data = [
      {
        id: "tx-1",
        user_id: "user-1",
        amount: -5,
        category: "FINE",
        description: "Late to chapter",
        created_at: at,
      },
    ];
    render(<PointsLedger />);

    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent("Fine");
    expect(row).not.toHaveTextContent("FINE");
    const time = row.querySelector("time");
    expect(time).toHaveAttribute("datetime", at);
    expect(time?.textContent).toBe(formatDayTime(at));
    expect(time).toHaveAttribute("title", formatTimestampFull(at));
    // No seconds in the visible date.
    expect(time?.textContent).not.toMatch(/:\d\d:\d\d/);
    expect(row).toHaveTextContent("-5 points");
  });

  it("draws no category, and no UNKNOWN, for a row without one", () => {
    fixtures.data = [{ id: "tx-1", user_id: "user-1", amount: 3 }];
    render(<PointsLedger />);

    expect(screen.queryByText("UNKNOWN")).not.toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("Alex");
  });

  it("offers every ledger category in the filter, Academic included", async () => {
    const user = userEvent.setup();
    render(<PointsLedger />);

    await user.click(screen.getByRole("button", { name: /^Filter the ledger/ }));
    screen.getByRole("menuitem", { name: /^Category/ }).focus();
    await user.keyboard("{ArrowRight}");
    expect(
      await screen.findByRole("menuitemradio", { name: "Academic" }),
    ).toBeInTheDocument();
  });

  it("opens on one member when a card's Ledger link sent it", () => {
    render(<PointsLedger initialMember="user-1" />);
    expect(fixtures.lastOptions).toMatchObject({ userId: "user-1" });
    expect(
      screen.getByRole("button", { name: "Filter the ledger, 1 on" }),
    ).toBeInTheDocument();
  });

  it("offers Adjust points in its header only to a role that may adjust", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<PointsLedger />);
    expect(
      screen.queryByRole("button", { name: "Adjust points" }),
    ).not.toBeInTheDocument();
    unmount();

    perms.list = ["points:view_all", "points:adjust"];
    render(<PointsLedger />);
    await user.click(screen.getByRole("button", { name: "Adjust points" }));
    expect(
      screen.getByRole("dialog", { name: "Adjust points" }),
    ).toBeInTheDocument();
  });

  it("exports the rows it shows", () => {
    fixtures.data = page(2);
    render(<PointsLedger />);
    expect(screen.getByRole("button", { name: /^Export/ })).toBeEnabled();
  });
});
