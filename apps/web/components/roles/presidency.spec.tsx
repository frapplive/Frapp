import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  transferPresidency,
  currentChapter,
  presidencyClaimStatus,
  claimPresidency,
} = vi.hoisted(() => ({
  transferPresidency: { mutateAsync: vi.fn(), isPending: false },
  currentChapter: {
    data: { needs_president: false } as
      { needs_president: boolean } | undefined,
  },
  presidencyClaimStatus: {
    data: undefined as
      | {
          needs_president: boolean;
          eligible: boolean;
          next_role_name: string | null;
        }
      | undefined,
    isLoading: false,
    isError: false,
  },
  claimPresidency: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock("@repo/hooks", () => ({
  useMembers: () => ({
    data: [{ id: "m2", user_id: "u2", display_name: "Sam Lee" }],
    isPending: false,
    isError: false,
  }),
  useViewerUserId: () => "u1",
  useViewerDisplayName: () => "Pat Kim",
  useTransferPresidency: () => transferPresidency,
  useCurrentChapter: () => currentChapter,
  usePresidencyClaimStatus: () => presidencyClaimStatus,
  useClaimPresidency: () => claimPresidency,
}));

vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import {
  PresidencyClaimBanner,
  TransferPresidencyRow,
} from "@/components/roles/presidency";

beforeEach(() => {
  transferPresidency.mutateAsync.mockReset().mockResolvedValue(undefined);
  claimPresidency.mutateAsync.mockReset().mockResolvedValue(undefined);
  Object.assign(currentChapter, { data: { needs_president: false } });
  Object.assign(presidencyClaimStatus, {
    data: undefined,
    isLoading: false,
    isError: false,
  });
});

describe("the orphan-president claim banner", () => {
  it("renders nothing when the chapter has a President", () => {
    Object.assign(currentChapter, { data: { needs_president: false } });
    render(<PresidencyClaimBanner />);
    expect(screen.queryByText(/needs a new president/i)).toBeNull();
  });

  it("reads nothing from the caller's permissions, so a member without roles:manage sees it", () => {
    Object.assign(currentChapter, { data: { needs_president: true } });
    Object.assign(presidencyClaimStatus, {
      data: {
        needs_president: true,
        eligible: true,
        next_role_name: "Treasurer",
      },
      isLoading: false,
    });
    render(<PresidencyClaimBanner />);
    expect(screen.getByText(/needs a new president/i)).toBeInTheDocument();
  });

  it("offers a claim button and names the eligible role when the caller is eligible", () => {
    Object.assign(currentChapter, { data: { needs_president: true } });
    Object.assign(presidencyClaimStatus, {
      data: {
        needs_president: true,
        eligible: true,
        next_role_name: "Treasurer",
      },
      isLoading: false,
    });
    render(<PresidencyClaimBanner />);
    expect(screen.getByText(/treasurer/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /claim presidency/i }),
    ).toBeInTheDocument();
  });

  it("names the eligible role but offers no claim button when the caller is ineligible", () => {
    Object.assign(currentChapter, { data: { needs_president: true } });
    Object.assign(presidencyClaimStatus, {
      data: {
        needs_president: true,
        eligible: false,
        next_role_name: "Treasurer",
      },
      isLoading: false,
    });
    render(<PresidencyClaimBanner />);
    expect(screen.getByText(/treasurer/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /claim presidency/i }),
    ).toBeNull();
  });

  it("shows a retry-able error rather than the support message when the status fetch fails", () => {
    // A failed fetch and a genuine "no eligible role" result must not read
    // the same — the former is retry-able, the latter tells a real officer
    // to contact support over a transient network blip.
    Object.assign(currentChapter, { data: { needs_president: true } });
    Object.assign(presidencyClaimStatus, {
      data: undefined,
      isLoading: false,
      isError: true,
    });
    render(<PresidencyClaimBanner />);
    expect(
      screen.getByText(/couldn't check who can claim it/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/contact frapp support/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /claim presidency/i }),
    ).toBeNull();
  });

  it("directs to Frapp support when no eligible role exists", () => {
    Object.assign(currentChapter, { data: { needs_president: true } });
    Object.assign(presidencyClaimStatus, {
      data: { needs_president: true, eligible: false, next_role_name: null },
      isLoading: false,
    });
    render(<PresidencyClaimBanner />);
    expect(screen.getByText(/contact frapp support/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /claim presidency/i }),
    ).toBeNull();
  });

  it("claims the presidency only after an in-product confirmation", async () => {
    const user = userEvent.setup();
    Object.assign(currentChapter, { data: { needs_president: true } });
    Object.assign(presidencyClaimStatus, {
      data: {
        needs_president: true,
        eligible: true,
        next_role_name: "Treasurer",
      },
      isLoading: false,
    });
    render(<PresidencyClaimBanner />);

    await user.click(screen.getByRole("button", { name: /claim presidency/i }));
    expect(claimPresidency.mutateAsync).not.toHaveBeenCalled();

    // Scoped to the dialog: its confirm button shares the trigger's exact
    // label ("Claim presidency"), same as this screen's existing
    // transfer-presidency confirmation.
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: /claim presidency/i }),
    );
    await waitFor(() => expect(claimPresidency.mutateAsync).toHaveBeenCalled());
  });
});

describe("Transfer presidency", () => {
  // The row's trigger shows only today's President, so its accessible name
  // carries what it does (#6029).
  it("names the trigger for what it does, beside who holds it now", () => {
    render(<TransferPresidencyRow />);
    expect(
      screen.getByRole("button", { name: "Transfer presidency, now Pat Kim" }),
    ).toHaveTextContent("Pat Kim");
  });

  it("moves the presidency only after an in-product confirmation", async () => {
    const user = userEvent.setup();
    render(<TransferPresidencyRow />);
    await user.click(
      screen.getByRole("button", { name: /^transfer presidency/i }),
    );
    await user.click(await screen.findByRole("option", { name: "Sam Lee" }));
    expect(transferPresidency.mutateAsync).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog", {
      name: "Transfer presidency to Sam Lee?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Transfer presidency" }),
    );
    await waitFor(() =>
      expect(transferPresidency.mutateAsync).toHaveBeenCalledWith({
        target_member_id: "m2",
      }),
    );
  });
});
