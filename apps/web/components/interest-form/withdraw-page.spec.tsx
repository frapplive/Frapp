import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WithdrawPage } from "./withdraw-page";

/**
 * The withdraw link's page (#5977): the token from the fragment, one choice
 * of two, a confirmation step, then done; a dead link says what to do.
 */

const state = vi.hoisted(() => ({
  preview: {
    isPending: false,
    isError: false,
    data: { chapter_name: "Phi Gamma Delta", at_school: true } as
      { chapter_name: string; at_school: boolean } | undefined,
  },
  mutate: vi.fn(),
  tokens: [] as (string | null)[],
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useInterestFormWithdrawalPreview: (token: string | null) => {
    state.tokens.push(token);
    return state.preview;
  },
  useWithdrawInterestForm: () => ({ mutate: state.mutate, isPending: false }),
}));

const TOKEN = "t".repeat(43);

describe("the withdraw link's page", () => {
  beforeEach(() => {
    state.mutate.mockReset();
    state.tokens = [];
    state.preview.isError = false;
    window.history.replaceState(null, "", `/withdraw#${TOKEN}`);
  });

  it("reads the token from the fragment, then drops it from the address bar", () => {
    render(<WithdrawPage />);
    expect(state.tokens).toContain(TOKEN);
    expect(window.location.hash).toBe("");
  });

  it("withdraws from the chapter only after the confirmation step", () => {
    state.mutate.mockImplementation((_body, options) => options.onSuccess());
    render(<WithdrawPage />);
    fireEvent.click(screen.getByLabelText(/Withdraw from Phi Gamma Delta/));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(state.mutate).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Withdraw from Phi Gamma Delta\? This can't be undone/),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(state.mutate).toHaveBeenCalledWith(
      { token: TOKEN, scope: "chapter" },
      expect.anything(),
    );
    expect(
      screen.getByText("You've withdrawn from Phi Gamma Delta."),
    ).toBeTruthy();
  });

  it("deletes everywhere when that is the pick", () => {
    render(<WithdrawPage />);
    fireEvent.click(screen.getByLabelText(/Delete my information everywhere/));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(state.mutate).toHaveBeenCalledWith(
      { token: TOKEN, scope: "everywhere" },
      expect.anything(),
    );
  });

  it("says what to do with a dead link", () => {
    state.preview.isError = true;
    render(<WithdrawPage />);
    expect(screen.getByText("This link doesn't work")).toBeTruthy();
    expect(screen.getByText(/team@frapp.live/)).toBeTruthy();
  });
});
