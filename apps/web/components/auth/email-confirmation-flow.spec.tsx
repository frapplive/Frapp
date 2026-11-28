import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthApiError, AuthWeakPasswordError } from "@supabase/supabase-js";

/**
 * The launch-day path (2026-11-09), screen by screen: an invited member
 * creates a password account on a hosted project, which requires email
 * confirmation (#3776), so no session comes back. Before this, the sign-up
 * screen toasted and bounced to the sign-in form, where every attempt read
 * "Something went wrong" and the magic link hit GoTrue's email cooldown.
 * Since #6134 the email carries a 6-digit code, typed on the same screen.
 */

const { replace, refresh, searchParams, toast, auth } = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  searchParams: { value: new URLSearchParams() },
  toast: vi.fn(),
  auth: {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signInWithOtp: vi.fn(),
    resend: vi.fn(async () => ({ data: {}, error: null })),
    verifyOtp: vi.fn(async () => ({ data: {}, error: null })),
    getSession: vi.fn(async () => ({ data: { session: null } })),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
  useSearchParams: () => searchParams.value,
}));
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ auth }),
}));
vi.mock("@/lib/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import SignUpPage from "@/app/(auth)/sign-up/page";
import { SignInScreen } from "./sign-in-screen";
import {
  EMAIL_SEND_CAPPED_COPY,
  WRONG_CREDENTIALS_COPY,
} from "@repo/hooks/auth-error-copy";

const EMAIL = "new.member@example.com";
const INVITE = "/join?token=inv-1";

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function submit(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.value = new URLSearchParams({ redirectTo: INVITE });
});

describe("sign-up on a project that confirms email", () => {
  beforeEach(() => {
    auth.signUp.mockResolvedValue({
      data: { session: null, user: { id: "u1", identities: [{ id: "i1" }] } },
      error: null,
    });
  });

  it("stays on the screen as 'Check your email' instead of bouncing to sign-in", async () => {
    render(<SignUpPage />);
    fill(/email/i, EMAIL);
    fill(/password/i, "correct horse");
    await submit(/create account/i);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Check your email");
    expect(screen.getByText(`Enter the 6-digit code we sent to ${EMAIL}.`)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });

  it("confirms the account with the emailed code and carries the invite on", async () => {
    render(<SignUpPage />);
    fill(/email/i, EMAIL);
    fill(/password/i, "correct horse");
    await submit(/create account/i);
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "654321" } });
    await waitFor(() => expect(replace).toHaveBeenCalledWith(INVITE));
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: EMAIL, token: "654321", type: "email" });
  });

  it("asks for the confirmation link to come back with intent=confirm and the invite", async () => {
    render(<SignUpPage />);
    fill(/email/i, EMAIL);
    fill(/password/i, "correct horse");
    await submit(/create account/i);

    const [args] = auth.signUp.mock.calls[0] as unknown as [
      { options: { emailRedirectTo: string } },
    ];
    const link = new URL(args.options.emailRedirectTo);
    expect(link.pathname).toBe("/auth/callback");
    expect(link.searchParams.get("next")).toBe(INVITE);
    expect(link.searchParams.get("intent")).toBe("confirm");
  });

  it("holds Send a new code for the minute after the first email", async () => {
    render(<SignUpPage />);
    fill(/email/i, EMAIL);
    fill(/password/i, "correct horse");
    await submit(/create account/i);
    expect(screen.getByRole("button", { name: "Send again in 60s" })).toBeDisabled();
  });

  it("goes back to 'Check your email' when the same address is resubmitted inside the minute", async () => {
    auth.signUp.mockResolvedValue({
      data: { session: null, user: null },
      error: new AuthApiError(
        "For security purposes, you can only request this after 37 seconds.",
        429,
        "over_email_send_rate_limit",
      ),
    });
    render(<SignUpPage />);
    fill(/email/i, EMAIL);
    fill(/password/i, "correct horse");
    await submit(/create account/i);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Check your email");
    expect(screen.getByRole("button", { name: "Send again in 37s" })).toBeDisabled();
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("holds Send a new code for at least a second when GoTrue says 'after 0 seconds'", async () => {
    auth.signUp.mockResolvedValue({
      data: { session: null, user: null },
      error: new AuthApiError(
        "For security purposes, you can only request this after 0 seconds.",
        429,
        "over_email_send_rate_limit",
      ),
    });
    render(<SignUpPage />);
    fill(/email/i, EMAIL);
    fill(/password/i, "correct horse");
    await submit(/create account/i);
    expect(screen.getByRole("button", { name: "Send again in 1s" })).toBeDisabled();
  });

  it("names a breached password through the page, not GoTrue's sentence", async () => {
    auth.signUp.mockResolvedValue({
      data: { session: null, user: null },
      error: new AuthWeakPasswordError("Password is known to be weak and easy to guess", 422, [
        "pwned",
      ]),
    });
    render(<SignUpPage />);
    fill(/email/i, EMAIL);
    fill(/password/i, "password123");
    await submit(/create account/i);

    const call = toast.mock.calls.at(-1)?.[0] as { title: string; description: string };
    expect(call.title).toBe("Unable to create account");
    expect(call.description).toMatch(/data breach/);
    expect(call.description).not.toMatch(/known to be weak/);
  });

  it("tells an address that already has an account to sign in, not to wait for email", async () => {
    auth.signUp.mockResolvedValue({
      data: { session: null, user: { id: "u1", identities: [] } },
      error: null,
    });
    render(<SignUpPage />);
    fill(/email/i, EMAIL);
    fill(/password/i, "correct horse");
    await submit(/create account/i);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Create your account");
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "You already have an account" }),
    );
  });
});

describe("password sign-in before the email is confirmed", () => {
  beforeEach(() => {
    auth.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: new AuthApiError("Email not confirmed", 400, "email_not_confirmed"),
    });
  });

  it("swaps the form for 'Confirm your email': that address, the code box and Send a new code", async () => {
    render(<SignInScreen />);
    fill(/email/i, EMAIL);
    fill(/password/i, "correct horse");
    await submit(/^continue$/i);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Confirm your email");
    expect(screen.getByText(new RegExp(`^Confirm ${EMAIL} first\\.`))).toBeInTheDocument();
    expect(screen.getByLabelText("6-digit code")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send a new code" })).toBeEnabled();
    expect(toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ description: "Something went wrong. Please try again." }),
    );
  });

  it("signs in with the code from the sign-up email", async () => {
    render(<SignInScreen />);
    fill(/email/i, EMAIL);
    fill(/password/i, "correct horse");
    await submit(/^continue$/i);
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "135790" } });
    await waitFor(() => expect(replace).toHaveBeenCalledWith(INVITE));
  });

  it("goes back to the form on request", async () => {
    render(<SignInScreen />);
    fill(/email/i, EMAIL);
    fill(/password/i, "correct horse");
    await submit(/^continue$/i);
    fireEvent.click(screen.getByRole("button", { name: /back to sign in/i }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Welcome back");
  });
});

describe("other sign-in refusals", () => {
  it("says a wrong password doesn't match", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
    });
    render(<SignInScreen />);
    fill(/email/i, EMAIL);
    fill(/password/i, "wrong");
    await submit(/^continue$/i);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Unable to sign in",
        description: WRONG_CREDENTIALS_COPY,
        variant: "destructive",
      }),
    );
  });

  it("asks for the emailed code in place, and signs in with it", async () => {
    auth.signInWithOtp.mockResolvedValue({ data: { session: null, user: null }, error: null });
    render(<SignInScreen />);
    fill(/email/i, EMAIL);
    await submit(/email me a code/i);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Check your email");
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "246810" } });
    await waitFor(() => expect(replace).toHaveBeenCalledWith(INVITE));
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: EMAIL, token: "246810", type: "email" });
  });

  it("reads a code asked for inside the email minute as already sent, on the code box", async () => {
    auth.signInWithOtp.mockResolvedValue({
      data: { session: null, user: null },
      error: new AuthApiError(
        "For security purposes, you can only request this after 44 seconds.",
        429,
        "over_email_send_rate_limit",
      ),
    });
    render(<SignInScreen />);
    fill(/email/i, EMAIL);
    await submit(/email me a code/i);
    expect(screen.getByRole("status")).toHaveTextContent("44 seconds");
    expect(screen.getByRole("button", { name: "Send again in 44s" })).toBeDisabled();
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("keeps intent=sign-in-link on the transition-era link beside the code (#3801)", async () => {
    auth.signInWithOtp.mockResolvedValue({ data: { session: null, user: null }, error: null });
    render(<SignInScreen />);
    fill(/email/i, EMAIL);
    await submit(/email me a code/i);
    const [args] = auth.signInWithOtp.mock.calls[0] as unknown as [
      { options: { emailRedirectTo: string } },
    ];
    const link = new URL(args.options.emailRedirectTo);
    expect(link.searchParams.get("next")).toBe(INVITE);
    expect(link.searchParams.get("intent")).toBe("sign-in-link");
  });

  it("reports the hourly email cap as a failure that sent nothing", async () => {
    auth.signInWithOtp.mockResolvedValue({
      data: { session: null, user: null },
      error: new AuthApiError("Email rate limit exceeded", 429, "over_email_send_rate_limit"),
    });
    render(<SignInScreen />);
    fill(/email/i, EMAIL);
    await submit(/email me a code/i);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Unable to send code",
        description: EMAIL_SEND_CAPPED_COPY,
        variant: "destructive",
      }),
    );
  });

  it("greets a confirmation link that couldn't sign this browser in as good news", () => {
    searchParams.value = new URLSearchParams({
      redirectTo: INVITE,
      authError: "email_confirmed",
    });
    render(<SignInScreen />);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Email confirmed" }),
    );
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });
});

describe("the sign-in page and the shell cache (#5049)", () => {
  it("clears every member's kept shell when it opens", () => {
    const key = "frapp.shell.v1|auth-a|chapter-1|roster";
    localStorage.setItem(key, "{}");
    localStorage.setItem("frapp.nav.collapsed", "1");
    render(<SignInScreen />);
    expect(localStorage.getItem(key)).toBe(null);
    expect(localStorage.getItem("frapp.nav.collapsed")).toBe("1");
    localStorage.clear();
  });
});
