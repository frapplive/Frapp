import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { cardFilledContainers } from "@/tests/card-surfaces";

const mocks = vi.hoisted(() => ({
  summary: {
    data: undefined as unknown,
    isPending: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  windows: [] as [string | undefined, string | undefined][],
  standing: undefined as
    | { points: { total: number; rank: number | null; ranked: number } | null }
    | undefined,
  permissions: ["members:view"] as string[],
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useMyPoints: (window?: string, archive?: string) => {
    mocks.windows.push([window, archive]);
    return mocks.summary;
  },
  useSemesters: () => ({ data: [{ id: "arch-1", label: "Spring 2026" }] }),
  useActivityStanding: () => ({ data: mocks.standing }),
  usePermissionList: () => mocks.permissions,
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

import { MyPointsPanel } from "./my-points-panel";

const tx = (
  id: string,
  amount: number,
  category: string,
  description: string,
) => ({
  id,
  amount,
  category,
  description,
  created_at: "2026-11-16T18:00:00Z",
});

describe("MyPointsPanel: your points on your Profile (#5950)", () => {
  beforeEach(() => {
    mocks.summary.data = {
      balance: 25,
      transactions: [
        tx("t-1", 10, "ATTENDANCE", "Chapter meeting attendance"),
        tx("t-2", 20, "SERVICE", "Philanthropy 5K course setup"),
        tx("t-3", -5, "FINE", ""),
      ],
    };
    mocks.summary.isPending = false;
    mocks.summary.isError = false;
    mocks.windows = [];
    mocks.standing = { points: { total: 25, rank: 2, ranked: 23 } };
    mocks.permissions = ["members:view"];
  });

  it("shows the balance for the period and every transaction behind it, on the page surface", () => {
    const { container } = render(<MyPointsPanel onClose={() => {}} />);
    expect(mocks.windows.at(-1)).toEqual(["all", undefined]);
    expect(screen.getByText("All time")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Chapter meeting attendance");
    expect(rows[0]).toHaveTextContent("+10");
    // A fine with no reason is titled by its category, and says it once.
    expect(rows[2]).toHaveTextContent("Fine");
    expect(rows[2]).toHaveTextContent("-5");
    expect(cardFilledContainers(container)).toEqual([]);
  });

  it("gives this semester's place, with the standings it is a place in", () => {
    render(<MyPointsPanel onClose={() => {}} />);
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Standings" })).toHaveAttribute(
      "href",
      "/members?sort=points",
    );
  });

  it("draws no place for a member with nothing this semester", () => {
    mocks.standing = { points: { total: 0, rank: 24, ranked: 24 } };
    render(<MyPointsPanel onClose={() => {}} />);
    expect(screen.queryByText("#24")).toBeNull();
  });

  it("links no standings for a role that can't open the Directory", () => {
    mocks.permissions = [];
    render(<MyPointsPanel onClose={() => {}} />);
    expect(screen.queryByRole("link", { name: "Standings" })).toBeNull();
  });

  it("filters and exports from its header", () => {
    render(<MyPointsPanel onClose={() => {}} />);
    expect(
      screen.getByRole("button", { name: /^Filter your points/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Export/ })).toBeEnabled();
  });

  it("says so in one line when there are no points yet, and offers no export", () => {
    mocks.summary.data = { balance: 0, transactions: [] };
    render(<MyPointsPanel onClose={() => {}} />);
    expect(
      screen.getByText("No points in this period yet."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Export/ })).toBeNull();
  });

  it("says the read failed rather than showing a zero", () => {
    mocks.summary.data = undefined;
    mocks.summary.isError = true;
    mocks.summary.error = new Error("boom");
    render(<MyPointsPanel onClose={() => {}} />);
    expect(screen.getByText("Couldn't load your points")).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
  });
});
