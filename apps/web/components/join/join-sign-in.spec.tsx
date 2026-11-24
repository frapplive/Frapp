// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { startWebOAuth, toast } = vi.hoisted(() => ({ startWebOAuth: vi.fn(), toast: vi.fn() }));

vi.mock("@/lib/auth/oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/oauth")>()),
  startWebOAuth,
}));
vi.mock("@/lib/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/lib/supabase/client", () => ({ createSupabaseBrowserClient: () => ({}) }));
vi.mock("@/lib/sentry/auth-failures", () => ({ reportAuthFailure: vi.fn() }));
vi.mock("./email-code-sign-in", () => ({ EmailCodeSignIn: () => null }));

import { DESKTOP_HANDOFF_COPY } from "@/lib/auth/oauth";
import { JoinSignIn } from "./join-sign-in";

afterEach(() => {
  cleanup();
  startWebOAuth.mockReset();
  toast.mockReset();
});

function renderCard() {
  render(<JoinSignIn returnTo="/join?token=inv-1" onStart={vi.fn()} onSignedIn={vi.fn()} />);
  return screen.getByRole("button", { name: "Continue with Google" });
}

describe("JoinSignIn", () => {
  it("keeps the spinner while the browser leaves for the provider", async () => {
    startWebOAuth.mockResolvedValue({ error: null, handedOff: false });
    const google = renderCard();
    await userEvent.click(google);
    await waitFor(() => expect(startWebOAuth).toHaveBeenCalled());
    expect(google.getAttribute("aria-busy")).toBe("true");
    expect(toast).not.toHaveBeenCalled();
  });

  it("gives the buttons back and says where the sign-in went inside the desktop app", async () => {
    startWebOAuth.mockResolvedValue({ error: null, handedOff: true });
    const google = renderCard();
    await userEvent.click(google);
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: DESKTOP_HANDOFF_COPY }));
    expect(google.getAttribute("aria-busy")).toBe("false");
    expect(google).toHaveProperty("disabled", false);
  });

  it("gives the buttons back with the reason when the start fails", async () => {
    startWebOAuth.mockResolvedValue({ error: { message: "refused" }, handedOff: false });
    const google = renderCard();
    await userEvent.click(google);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })),
    );
    expect(google).toHaveProperty("disabled", false);
  });
});
