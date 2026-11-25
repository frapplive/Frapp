import type React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ASK_COPY } from "@repo/validation";

/**
 * The real host and New's page together (the page since Paul's pick of
 * 2026-11-22, opened by the sidebar's New row since #5946).
 * `ask-host.spec.tsx` and `ask-page.spec.tsx` each stand the other in, so
 * neither sees what passes between them: the draft kept across a visit, and
 * what the page does when the assistant itself comes and goes under it.
 */

const who = vi.hoisted(() => ({
  previewing: false,
  permissions: ["ai:use"] as string[] | undefined,
  council: false,
}));
// The open tenant's kind (#5933): a chapter unless a case makes it a council.
vi.mock("@/lib/hooks/use-tenant-kind", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hooks/use-tenant-kind")>()),
  useTenantKind: () => (who.council ? "council" : "chapter"),
  useIsCouncil: () => who.council,
}));
// The council's home has its own reads; here only that New opens it.
vi.mock("@/components/councils/council-home", () => ({
  CouncilHome: () => <section aria-label="Home" data-council-home="" />,
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  AskConversationProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useActiveChapterId: () => "chapter-1",
  useAiConsent: () => ({ data: null }),
  aiAvailableFrom: () => true,
  useAiChapterSettings: () => ({ data: { ask: true } }),
  useMyPermissions: () => ({
    data: who.permissions ? { permissions: who.permissions } : undefined,
  }),
  useViewerUserId: () => null,
  useViewerDisplayName: () => null,
  // New's actions read the member view of the chapter for its modules.
  useCurrentChapter: () => ({ data: undefined }),
  useAsk: () => ({
    exchanges: [],
    working: false,
    ask: vi.fn(),
    retry: vi.fn(),
    setProposal: vi.fn(),
    resolveProposal: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  }),
  useActStatus: () => ({ data: null }),
  useAskSuggestions: () => ({ suggestions: [] }),
  useActEventAudience: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAskStatus: () => ({
    refetch: vi.fn(),
    data: {
      saved_until: null,
      diagnostics: { offered: false, can_change: false, ends_at: null },
    },
  }),
}));
// The address bar: `push` and `replace` move it, and the page follows.
const nav = vi.hoisted(() => {
  let pathname = "/events";
  const listeners = new Set<() => void>();
  const go = (to: string) => {
    pathname = to;
    for (const listener of listeners) listener();
  };
  return {
    get pathname() {
      return pathname;
    },
    go,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    usePathname: () => useSyncExternalStore(nav.subscribe, () => nav.pathname),
    useRouter: () => ({ push: nav.go, replace: nav.go }),
  };
});
vi.mock("@/lib/stores/role-preview-store", () => ({
  useIsRolePreviewActive: () => who.previewing,
}));
vi.mock("@/components/ai/meet-frapp-ai", () => ({
  useAiConsentGate: () => ({
    ensureConsent: vi.fn().mockResolvedValue(true),
    consentDialog: null,
  }),
}));

const { AskHost } = await import("./ask-host");
const { isAskRoute } = await import("@/components/layout/shell-layout");
const { AskPage } = await import("./ask-page");
const { usePathname } = await import("next/navigation");

/** The shell, cut down: the New row, and the route's page. */
function Shell() {
  const pathname = usePathname();
  return (
    <>
      <button type="button" onClick={() => nav.go("/ask")}>
        New
      </button>
      {isAskRoute(pathname) ? <AskPage /> : null}
    </>
  );
}

function Page() {
  return (
    <AskHost>
      <Shell />
    </AskHost>
  );
}

const newRow = () => screen.getByRole("button", { name: "New" });
const field = () =>
  screen.queryByRole("textbox", { name: ASK_COPY.placeholder });

beforeEach(() => {
  who.previewing = false;
  who.permissions = ["ai:use"];
  who.council = false;
  nav.go("/events");
});

describe("New and Frapp Intelligence together", () => {
  it("opens the assistant's field on New, as a page and not a dialog", async () => {
    const user = userEvent.setup();
    render(<Page />);
    expect(field()).toBeNull();
    await user.click(newRow());
    expect(nav.pathname).toBe("/ask");
    expect(field()).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps a member who loses the assistant on New, without the field (#5946)", async () => {
    const user = userEvent.setup();
    const view = render(<Page />);
    await user.click(newRow());
    expect(field()).toBeInTheDocument();
    // An officer starts viewing the chapter as a role.
    who.previewing = true;
    view.rerender(<Page />);
    await waitFor(() => expect(field()).toBeNull());
    expect(nav.pathname).toBe("/ask");
    // The page still greets them, where the forms they can start sit.
    expect(
      screen.getByText(/^Good (morning|afternoon|evening)/),
    ).toBeInTheDocument();
    who.previewing = false;
    view.rerender(<Page />);
    expect(field()).toBeInTheDocument();
  });

  it("opens a council's home on New, with no field and no chapter forms (#5933)", async () => {
    who.council = true;
    const user = userEvent.setup();
    render(<Page />);
    await user.click(newRow());
    expect(nav.pathname).toBe("/ask");
    expect(
      await screen.findByRole("region", { name: "Home" }),
    ).toBeInTheDocument();
    expect(field()).toBeNull();
    expect(
      screen.queryByRole("list", { name: "Start something new" }),
    ).toBeNull();
  });

  it("keeps what the member had typed when they leave the page and come back", async () => {
    const user = userEvent.setup();
    render(<Page />);
    await user.click(newRow());
    await user.type(field()!, "Who is driving");
    nav.go("/events");
    await waitFor(() => expect(field()).toBeNull());
    await user.click(newRow());
    expect(field()).toHaveValue("Who is driving");
  });

  it("holds the page in its loading shape while whether the member has the assistant is read", () => {
    who.permissions = undefined;
    nav.go("/ask");
    render(<Page />);
    expect(field()).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading Frapp Intelligence",
    );
    expect(nav.pathname).toBe("/ask");
  });
});
