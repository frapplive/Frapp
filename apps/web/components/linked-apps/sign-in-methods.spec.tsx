import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { identities, linkIdentity, unlinkIdentity, toastSpy, bridge } =
  vi.hoisted(() => ({
    identities: vi.fn(),
    linkIdentity: vi.fn(),
    unlinkIdentity: vi.fn(),
    toastSpy: vi.fn(),
    bridge: { current: null as unknown },
  }));

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getUserIdentities: identities,
      getUser: async () => ({ data: { user: { email: "me@frapp.live" } } }),
      linkIdentity,
      unlinkIdentity,
    },
  }),
}));
vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));
vi.mock("@/lib/desktop/bridge", async () => {
  const actual = await vi.importActual<typeof import("@/lib/desktop/bridge")>(
    "@/lib/desktop/bridge",
  );
  return { ...actual, desktopBridge: () => bridge.current };
});

import { SignInMethodRows } from "./sign-in-methods";

const EMAIL = { id: "i-email", provider: "email", identity_data: {} };
const GOOGLE = {
  id: "i-google",
  provider: "google",
  identity_data: { email: "g@gmail.com" },
};

function renderRows() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ul>
        <SignInMethodRows />
      </ul>
    </QueryClientProvider>,
  );
}

function row(name: string) {
  return screen.getByText(name).closest("li")!;
}

function hasIdentities(list: unknown[]) {
  identities.mockResolvedValue({ data: { identities: list }, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  bridge.current = null;
  window.history.replaceState(null, "", "/preferences?section=account");
  hasIdentities([EMAIL, GOOGLE]);
  linkIdentity.mockResolvedValue({ data: {}, error: null });
  unlinkIdentity.mockResolvedValue({ data: {}, error: null });
});

describe("Settings → Account → Sign in: link and unlink (#2223)", () => {
  it("links a missing provider through /auth/callback, tagged as a link back to Account", async () => {
    renderRows();
    await screen.findByText("g@gmail.com");
    // Email never offers a control; Google is on the account.
    expect(within(row("Email")).queryByRole("button")).toBeNull();
    await userEvent.click(
      within(row("Apple")).getByRole("button", { name: "Link Apple" }),
    );
    expect(linkIdentity).toHaveBeenCalledTimes(1);
    const { provider, options } = linkIdentity.mock.calls[0]![0];
    expect(provider).toBe("apple");
    const callback = new URL(options.redirectTo);
    expect(callback.pathname).toBe("/auth/callback");
    expect(callback.searchParams.get("intent")).toBe("link");
    expect(callback.searchParams.get("next")).toBe(
      "/preferences?section=account&linking=apple",
    );
  });

  it("says linking is off when the project refuses it, not GoTrue's sentence", async () => {
    linkIdentity.mockResolvedValue({
      data: null,
      error: { message: "Manual linking is disabled", code: "manual_linking_disabled" },
    });
    renderRows();
    await screen.findByText("g@gmail.com");
    await userEvent.click(
      within(row("Apple")).getByRole("button", { name: "Link Apple" }),
    );
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: "Couldn't link Apple",
          description:
            "Linking another sign-in method isn't turned on yet. Try again later.",
        }),
      ),
    );
    // The button comes back for another try.
    expect(
      within(row("Apple")).getByRole("button", { name: "Link Apple" }),
    ).toBeEnabled();
  });

  it("disables Link in the desktop app, which can't show the provider's page", async () => {
    bridge.current = { openExternal: vi.fn() };
    renderRows();
    await screen.findByText("g@gmail.com");
    const link = within(row("Apple")).getByRole("button", {
      name: "Link Apple",
    });
    expect(link).toBeDisabled();
    expect(link).toHaveAttribute(
      "title",
      "Open Frapp in your browser to link this.",
    );
  });

  it("unlinks after a confirm, then rereads the identities", async () => {
    renderRows();
    await screen.findByText("g@gmail.com");
    await userEvent.click(
      within(row("Google")).getByRole("button", { name: "More for Google" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Unlink…" }),
    );
    expect(await screen.findByText("Unlink Google?")).toBeInTheDocument();
    expect(unlinkIdentity).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(unlinkIdentity).toHaveBeenCalledWith(GOOGLE));
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith({ description: "Google unlinked" }),
    );
    expect(identities).toHaveBeenCalledTimes(2);
  });

  it("never offers to unlink the last way in", async () => {
    hasIdentities([GOOGLE]);
    renderRows();
    await screen.findByText("g@gmail.com");
    expect(
      within(row("Google")).queryByRole("button", { name: "More for Google" }),
    ).toBeNull();
  });

  it("says a link that came back refused, once, and clears it from the address", async () => {
    window.history.replaceState(
      null,
      "",
      "/preferences?section=account&linking=google&linkError=identity_already_exists",
    );
    hasIdentities([EMAIL]);
    renderRows();
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Couldn't link Google",
          description: expect.stringContaining(
            "That Google account already signs in to a different Frapp account",
          ),
        }),
      ),
    );
    expect(window.location.search).toBe("?section=account");
  });

  it("says a link that came back without an error worked", async () => {
    window.history.replaceState(
      null,
      "",
      "/preferences?section=account&linking=apple",
    );
    renderRows();
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith({ description: "Apple linked" }),
    );
    expect(window.location.search).toBe("?section=account");
  });
});
