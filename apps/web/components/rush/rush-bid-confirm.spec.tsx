import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { preview, confirm } = vi.hoisted(() => ({
  preview: {
    current: {} as Record<string, unknown>,
    token: null as string | null,
  },
  confirm: vi.fn(),
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useRushBidConfirmationPreview: (token: string | null) => {
    preview.token = token;
    return preview.current;
  },
  useConfirmRushBidByToken: () => ({ mutate: confirm, isPending: false }),
}));

const { RushBidConfirm } = await import("./rush-bid-confirm");

const WAITING = {
  chapter_name: "FIJI",
  recorded_by_name: "Chris",
  expires_at: "2026-12-01T12:00:00Z",
  status: "waiting",
};

beforeEach(() => {
  confirm.mockReset();
  preview.current = {
    data: WAITING,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  };
  window.history.replaceState(null, "", "/recruitment/confirm#tok-123");
});

describe("the PNM's one-tap page (#5973)", () => {
  it("reads the token from the fragment and confirms only on the tap", async () => {
    render(<RushBidConfirm />);
    expect(preview.token).toBe("tok-123");
    expect(
      screen.getByRole("heading", { name: "FIJI's bid" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Recorded by Chris, waiting to be confirmed"),
    ).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm I accepted" }),
    );
    expect(confirm).toHaveBeenCalledWith("tok-123", expect.anything());
  });

  it("says it's done once confirmed", () => {
    preview.current = {
      ...preview.current,
      data: { ...WAITING, status: "confirmed" },
    };
    render(<RushBidConfirm />);
    expect(screen.getByText("Accepted · confirmed by you")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers nothing on a closed bid, or a link that no longer works", () => {
    preview.current = {
      ...preview.current,
      data: { ...WAITING, status: "closed" },
    };
    const { unmount } = render(<RushBidConfirm />);
    expect(screen.queryByRole("button")).toBeNull();
    unmount();
    preview.current = {
      isPending: false,
      isError: true,
      error: { status: 404 },
      refetch: vi.fn(),
    };
    render(<RushBidConfirm />);
    expect(
      screen.getByRole("heading", { name: "This link doesn't work any more" }),
    ).toBeInTheDocument();
  });

  it("says the link is incomplete with no token", () => {
    window.history.replaceState(null, "", "/recruitment/confirm");
    render(<RushBidConfirm />);
    expect(
      screen.getByRole("heading", { name: "This link doesn't work any more" }),
    ).toBeInTheDocument();
  });
});
