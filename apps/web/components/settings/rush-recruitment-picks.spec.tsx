import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { settings } = vi.hoisted(() => ({
  settings: { current: {} as Record<string, unknown> },
}));

const ok = (data: unknown) => ({
  data,
  isPending: false,
  isError: false,
  isSuccess: true,
});

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useRushSettings: () => ok(settings.current),
  useSaveRushSettings: () => ({ mutate: vi.fn(), isPending: false }),
  useRoles: () =>
    ok([
      { id: "p", name: "President", permissions: ["*"] },
      { id: "nm", name: "New Member", permissions: [] },
      { id: "b", name: "Brother", permissions: [] },
    ]),
  useGroups: () => ok([{ id: "g", name: "Rush committee" }]),
  useChannels: () =>
    ok([
      { id: "c1", name: "rush", type: "ROLE_GATED", archived_at: null },
      { id: "c2", name: "old", type: "PUBLIC", archived_at: "2026-01-01" },
    ]),
}));

const { RushBidExpiryRow, RushRecruitmentPicks } =
  await import("./rush-recruitment-picks");

const BASE = {
  stale_days: 7,
  bid_expiry_days: 7,
  new_member_role_id: null,
  default_new_member_role_id: "nm",
  contacts_group_id: null,
  contacts_group_skipped: [],
  card_channel_id: null,
};

beforeEach(() => {
  settings.current = { ...BASE };
});

describe("RushRecruitmentPicks (#5973)", () => {
  it("shows the default new member role as the value", () => {
    render(<RushRecruitmentPicks canEdit canSeeRoles />);
    expect(
      screen.getByRole("combobox", { name: "New member role" }),
    ).toHaveTextContent("New Member (default)");
    expect(
      screen.getByRole("combobox", { name: "Card channel" }),
    ).toHaveTextContent("No card");
  });

  it("shows how long bids last, typed by rush:manage and read by others", () => {
    const { unmount } = render(
      <ul>
        <RushBidExpiryRow canEdit />
      </ul>,
    );
    expect(
      screen.getByRole("textbox", {
        name: "Days a bid stays open before it expires",
      }),
    ).toHaveValue("7");
    unmount();
    render(
      <ul>
        <RushBidExpiryRow canEdit={false} />
      </ul>,
    );
    expect(screen.getByText("Bids expire after 7 days")).toBeInTheDocument();
  });

  it("asks for a pick when the New members tier holds no role", () => {
    settings.current = { ...BASE, default_new_member_role_id: null };
    render(<RushRecruitmentPicks canEdit canSeeRoles />);
    expect(
      screen.getByText("Your New members tier has no role. Pick one."),
    ).toBeInTheDocument();
  });

  it("names the contacts Group members who can't open recruitment", () => {
    settings.current = {
      ...BASE,
      contacts_group_id: "g",
      contacts_group_skipped: [
        { user_id: "a", display_name: "Ana" },
        { user_id: "b", display_name: "Ben" },
      ],
    };
    render(<RushRecruitmentPicks canEdit canSeeRoles />);
    expect(
      screen.getByText("Ana and Ben can't open recruitment, so aren't told."),
    ).toBeInTheDocument();
  });

  it("reads only, with the reason, without rush:manage", () => {
    render(<RushRecruitmentPicks canEdit={false} canSeeRoles />);
    for (const name of [
      "New member role",
      "Recruitment contacts",
      "Card channel",
    ]) {
      expect(screen.getByRole("combobox", { name })).toBeDisabled();
    }
    expect(
      screen.getAllByText("Your role can't change this.").length,
    ).toBeGreaterThan(0);
  });
});
