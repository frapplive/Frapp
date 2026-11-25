import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RushDashboard } from "@repo/hooks";
import { RushSummary } from "./rush-summary";

const DASHBOARD: RushDashboard = {
  funnel: [
    { id: "new", label: "New", category: "new", count: 4 },
    { id: "met", label: "Met", category: "met", count: 2 },
    { id: "closed", label: "Closed", category: "closed", count: 1 },
  ],
  open: 6,
  needsFollowUp: 2,
  followUpsDue: 1,
  mine: 3,
  bids: {
    extended: 3,
    out: 1,
    waiting: 1,
    accepted: 1,
    declined: 1,
    expired: 0,
  },
  results: {
    topRated: [{ id: "ana", display_name: "Ana", value: 4.5, count: 2 }],
    mostVotes: [],
  },
};

describe("RushSummary (#5973)", () => {
  it("shows the counts, the funnel in the board's order, and the results", async () => {
    const onOpen = vi.fn();
    render(<RushSummary dashboard={DASHBOARD} canOwn onOpen={onOpen} />);

    expect(screen.getByText("Open prospects").nextSibling).toHaveTextContent(
      "6",
    );
    expect(screen.getByText("Yours").nextSibling).toHaveTextContent("3");

    const funnel = screen.getByRole("region", { name: "By stage" });
    expect(
      within(funnel)
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual(["New4", "Met2", "Closed1"]);

    const bids = screen.getByRole("region", { name: "Bids" });
    expect(
      within(bids).getByText("Waiting to confirm").nextSibling,
    ).toHaveTextContent("1");

    expect(screen.getByText("4.5 from 2 ratings")).toBeInTheDocument();
    expect(
      screen.getByText("Nobody has voted on an open prospect yet."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Ana/ }));
    expect(onOpen).toHaveBeenCalledWith("ana");
  });

  it("leaves out Yours for a role that can't own prospects, and the results without rush:view_results", () => {
    render(
      <RushSummary
        dashboard={{ ...DASHBOARD, results: null }}
        canOwn={false}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.queryByText("Yours")).not.toBeInTheDocument();
    expect(screen.queryByText("Top rated")).not.toBeInTheDocument();
    expect(screen.queryByText("Most votes")).not.toBeInTheDocument();
  });
});
