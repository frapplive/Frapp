import type React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ASK_COPY } from "@repo/validation";

/**
 * The real host, the Ask bar and the Ask page together (the bar since
 * #5476, the page since Paul's pick of 2026-11-22). `ask-host.spec.tsx` and
 * `ask-page.spec.tsx` each stand the other in, so neither sees what passes
 * between them: the bar opening the page, focus landing in its field, and
 * what the page does when Ask itself comes and goes under it.
 */

const who = vi.hoisted(() => ({
  previewing: false,
  permissions: ["ai:use"] as string[] | undefined,
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
const { AskBar } = await import("./ask-bar");
const { AskPage } = await import("./ask-page");
const { usePathname } = await import("next/navigation");

/** The shell, cut down: the bar, and the route's page. */
function Shell() {
  const pathname = usePathname();
  return (
    <>
      <AskBar />
      <input aria-label="Message" />
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

const entry = () => screen.getByRole("button", { name: ASK_COPY.placeholder });
const field = () =>
  screen.queryByRole("textbox", { name: ASK_COPY.placeholder });

beforeEach(() => {
  who.previewing = false;
  who.permissions = ["ai:use"];
  nav.go("/events");
});

describe("the entry and the Ask page together", () => {
  it("draws the bar as the field it opens: the crest, the words and the arrow", () => {
    render(<Page />);
    expect(entry()).toHaveTextContent(ASK_COPY.placeholder);
    expect(entry()).not.toHaveAttribute("aria-current");
    expect(entry()).not.toHaveAttribute("aria-haspopup");
    expect(entry().querySelectorAll("svg")).toHaveLength(2);
  });

  it("opens the Ask page from the bar with the cursor in its field, and marks the bar as the page on screen", async () => {
    const user = userEvent.setup();
    render(<Page />);
    expect(field()).toBeNull();
    await user.click(entry());
    expect(nav.pathname).toBe("/ask");
    expect(field()).toHaveFocus();
    expect(entry()).toHaveAttribute("aria-current", "page");
    // No dialog: the page, and the app around it, stay usable.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("puts the cursor back in the field when the bar is used on the Ask page", async () => {
    const user = userEvent.setup();
    render(<Page />);
    await user.click(entry());
    await user.click(screen.getByRole("textbox", { name: "Message" }));
    await user.click(entry());
    expect(nav.pathname).toBe("/ask");
    expect(field()).toHaveFocus();
  });

  it("takes a member who loses Ask on the Ask page to chat, and does not bring them back when Ask returns", async () => {
    const user = userEvent.setup();
    const view = render(<Page />);
    await user.click(entry());
    expect(field()).toBeInTheDocument();
    // An officer starts viewing the chapter as a role.
    who.previewing = true;
    view.rerender(<Page />);
    await waitFor(() => expect(nav.pathname).toBe("/chat"));
    expect(field()).toBeNull();
    expect(
      screen.queryByRole("button", { name: ASK_COPY.placeholder }),
    ).toBeNull();
    who.previewing = false;
    view.rerender(<Page />);
    expect(entry()).toBeInTheDocument();
    expect(nav.pathname).toBe("/chat");
  });

  it("keeps what the member had typed when they leave the page and come back", async () => {
    const user = userEvent.setup();
    render(<Page />);
    await user.click(entry());
    await user.type(field()!, "Who is driving");
    nav.go("/events");
    await waitFor(() => expect(field()).toBeNull());
    await user.click(entry());
    expect(field()).toHaveValue("Who is driving");
  });

  it("holds the page in its loading shape while whether the member has Ask is read", () => {
    who.permissions = undefined;
    nav.go("/ask");
    render(<Page />);
    expect(field()).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Loading Ask Frapp");
    expect(nav.pathname).toBe("/ask");
  });
});
