import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthApiError } from "@supabase/supabase-js";

const { resend, verifyOtp, getSession, onAuthStateChange, authListener, captureException } =
  vi.hoisted(() => {
    const authListener: { current: ((event: string, session: unknown) => void) | null } = {
      current: null,
    };
    return {
      resend: vi.fn(async () => ({ data: {}, error: null as unknown })),
      verifyOtp: vi.fn(async () => ({ data: {}, error: null as unknown })),
      getSession: vi.fn(async () => ({ data: { session: null as unknown } })),
      onAuthStateChange: vi.fn((callback: (event: string, session: unknown) => void) => {
        authListener.current = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      authListener,
      captureException: vi.fn(),
    };
  });

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { resend, verifyOtp, getSession, onAuthStateChange },
  }),
}));

vi.mock("@sentry/nextjs", () => ({ captureException }));

import { EMAIL_RESEND_COOLDOWN_SECONDS as RESEND_COOLDOWN_SECONDS } from "@repo/hooks/auth-error-copy";
import { CheckEmail } from "./check-email";

const EMAIL = "new.member@example.com";

function renderPanel(
  options: { cooldown?: number; lead?: string } = {},
): { onBack: ReturnType<typeof vi.fn>; onConfirmed: ReturnType<typeof vi.fn> } {
  const onBack = vi.fn();
  const onConfirmed = vi.fn();
  render(
    <CheckEmail
      email={EMAIL}
      redirectTo="/join?token=inv-1"
      screen="/sign-up"
      lead={options.lead}
      initialCooldownSeconds={options.cooldown ?? 0}
      backLabel="Use a different email"
      onBack={onBack}
      onConfirmed={onConfirmed}
    />,
  );
  return { onBack, onConfirmed };
}

function codeField(): HTMLInputElement {
  return screen.getByLabelText("6-digit code");
}

describe("CheckEmail: the confirmation code (#6134)", () => {
  beforeEach(() => {
    resend.mockReset().mockResolvedValue({ data: {}, error: null });
    verifyOtp.mockReset().mockResolvedValue({ data: {}, error: null });
    captureException.mockReset();
    getSession.mockReset().mockResolvedValue({ data: { session: null } });
    authListener.current = null;
    vi.stubGlobal("location", { ...window.location, origin: "https://app.frapp.live" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("asks for the code sent to the address, in a field iOS and Android can fill", () => {
    renderPanel();
    expect(screen.getByText(`Enter the 6-digit code we sent to ${EMAIL}.`)).toBeInTheDocument();
    const field = codeField();
    expect(field).toHaveAttribute("autocomplete", "one-time-code");
    expect(field).toHaveAttribute("inputmode", "numeric");
    expect(field).toHaveFocus();
  });

  it("confirms with the code as soon as six digits are pasted, and carries on", async () => {
    const { onConfirmed } = renderPanel();
    fireEvent.change(codeField(), { target: { value: "123 456" } });
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    expect(verifyOtp).toHaveBeenCalledWith({ email: EMAIL, token: "123456", type: "email" });
  });

  it("clears a wrong code and says so in plain words, without reporting it", async () => {
    verifyOtp.mockResolvedValue({
      data: {},
      error: new AuthApiError("Token has expired or is invalid", 403, "otp_expired"),
    });
    const { onConfirmed } = renderPanel();
    fireEvent.change(codeField(), { target: { value: "111111" } });
    expect(
      await screen.findByText("That code didn't work. Use the newest email, or send a new code."),
    ).toBeInTheDocument();
    expect(codeField()).toHaveValue("");
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("keeps the code and reports an Auth outage, which isn't the member's code", async () => {
    verifyOtp.mockResolvedValue({
      data: {},
      error: new AuthApiError("upstream", 500, "unexpected_failure"),
    });
    renderPanel();
    fireEvent.change(codeField(), { target: { value: "222222" } });
    await waitFor(() => expect(captureException).toHaveBeenCalledTimes(1));
    expect(codeField()).toHaveValue("222222");
  });

  it("holds Send a new code for the minute GoTrue would refuse it, counting down", () => {
    vi.useFakeTimers();
    renderPanel({ cooldown: RESEND_COOLDOWN_SECONDS });
    expect(screen.getByRole("button", { name: "Send again in 60s" })).toBeDisabled();
    for (let tick = 0; tick < 60; tick += 1) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }
    expect(screen.getByRole("button", { name: "Send a new code" })).toBeEnabled();
  });

  it("resends the confirmation as a signup email and says it went", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Send a new code" }));
    expect(await screen.findByText(`We sent a new code to ${EMAIL}.`)).toBeInTheDocument();
    expect(resend).toHaveBeenCalledWith(
      expect.objectContaining({ type: "signup", email: EMAIL }),
    );
    expect(screen.getByRole("button", { name: /Send again in \d+s/ })).toBeDisabled();
  });

  it("reads a refused resend inside the minute as 'already sent', not as a failure", async () => {
    resend.mockResolvedValue({
      data: {},
      error: new AuthApiError(
        "For security purposes, you can only request this after 42 seconds.",
        429,
        "over_email_send_rate_limit",
      ),
    });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Send a new code" }));
    expect(await screen.findByRole("status")).toHaveTextContent("We just sent you an email.");
    expect(screen.queryByRole("alert")).toBeNull();
    // Still reported, at info: observability.md § Signed-out auth failures.
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ level: "info" }));
    expect(screen.getByRole("button", { name: "Send again in 42s" })).toBeDisabled();
  });

  it("never offers Send a new code while GoTrue says 'after 0 seconds'", async () => {
    resend.mockResolvedValue({
      data: {},
      error: new AuthApiError(
        "For security purposes, you can only request this after 0 seconds.",
        429,
        "over_email_send_rate_limit",
      ),
    });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Send a new code" }));
    expect(await screen.findByRole("button", { name: "Send again in 1s" })).toBeDisabled();
  });

  it("says plainly when the hourly email cap refused the resend", async () => {
    resend.mockResolvedValue({
      data: {},
      error: new AuthApiError("Email rate limit exceeded", 429, "over_email_send_rate_limit"),
    });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Send a new code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We can't send email right now. Too many went out in the last hour.",
    );
  });

  it("says where the code came from when the sign-in form found the address unconfirmed", () => {
    renderPanel({ lead: "Confirm it first." });
    expect(screen.getByText("Confirm it first.")).toBeInTheDocument();
  });

  it("carries on once a transition-era link signs this browser in elsewhere, only once", async () => {
    const { onConfirmed } = renderPanel();
    act(() => {
      authListener.current?.("SIGNED_IN", { access_token: "t" });
    });
    getSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it("stays put when the member comes back still signed out", async () => {
    const { onConfirmed } = renderPanel();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("goes back with the back label", () => {
    const { onBack } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
