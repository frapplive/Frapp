import type React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ask Frapp's front door on web: the floating Ask bar (#5476, Paul's pick of
 * 2026-11-18). The host hands the bar a way in (`useAskEntry`), which opens
 * the Ask page (`/ask`, Paul's pick of 2026-11-22).
 */

const who = vi.hoisted(() => ({
  available: true as boolean | undefined,
  ask: true as boolean | undefined,
  permissions: ["ai:use"] as string[] | undefined,
  previewing: false,
  chapterId: "chapter-1",
  settingsEnabled: [] as boolean[],
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  // The conversation and the channel's side of it have their own specs
  // (`use-ask.spec.tsx`, `ask-in-channel.spec.tsx`). Here it only has to be
  // the one conversation, over everything that reads it, and this chapter's.
  AskConversationProvider: ({
    scope,
    children,
  }: {
    scope: string | null;
    children: React.ReactNode;
  }) => (
    <div data-testid="ask-conversation" data-scope={scope ?? ""}>
      {children}
    </div>
  ),
  askAccessFrom: (await importOriginal<typeof import("@repo/hooks")>())
    .askAccessFrom,
  useActiveChapterId: () => who.chapterId,
  useAiConsent: () => ({ data: null }),
  aiAvailableFrom: () => who.available,
  useAiChapterSettings: (options: { enabled: boolean }) => {
    who.settingsEnabled.push(options.enabled);
    return { data: who.ask === undefined ? undefined : { ask: who.ask } };
  },
  useMyPermissions: () => ({
    data: who.permissions ? { permissions: who.permissions } : undefined,
  }),
}));
vi.mock("@/lib/stores/role-preview-store", () => ({
  useIsRolePreviewActive: () => who.previewing,
}));
const bridge = vi.hoisted(() => ({ access: [] as string[] }));
vi.mock("@/components/ask/ask-in-channel", () => ({
  AskInChannelBridge: (props: {
    access: string;
    children: React.ReactNode;
  }) => {
    bridge.access.push(props.access);
    return <div data-testid="ask-bridge">{props.children}</div>;
  },
}));

const nav = vi.hoisted(() => ({
  pathname: "/chat" as string | null,
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
}));

const { AskHost, isAskRoute, useAskEntry } = await import("./ask-host");

/** A page with an entry on it, as `ask-bar.tsx` reaches Ask. */
function Page({ name = "chat" }: { name?: string }) {
  const ask = useAskEntry();
  return (
    <section aria-label={name}>
      {ask ? (
        <>
          <button onClick={ask.openAsk}>open</button>
          <output>{ask.open ? "open" : "closed"}</output>
        </>
      ) : null}
    </section>
  );
}
const entry = () => screen.queryByRole("button", { name: "open" });

beforeEach(() => {
  who.available = true;
  who.ask = true;
  who.permissions = ["ai:use"];
  who.previewing = false;
  who.chapterId = "chapter-1";
  who.settingsEnabled = [];
  bridge.access = [];
  nav.pathname = "/chat";
  nav.push.mockReset();
  nav.replace.mockReset();
});

describe("who gets Ask Frapp", () => {
  it("is a member the server has AI for, in a chapter with Ask on, who may use it", () => {
    render(
      <AskHost>
        <Page />
      </AskHost>,
    );
    expect(entry()).toBeInTheDocument();
    // And the same member may ask from a channel with `@Frapp` (#4713).
    expect(bridge.access.at(-1)).toBe("yes");
  });

  it("holds one conversation over the Ask page and every channel, and it is this chapter's (#4713)", () => {
    // Without the one provider above both, a question asked with `@Frapp`
    // would be missing from the Ask page, and "one question at a time" would
    // not hold across them. Scoped, so it starts over in another chapter.
    const view = render(
      <AskHost>
        <Page />
      </AskHost>,
    );
    const conversation = screen.getByTestId("ask-conversation");
    expect(conversation).toHaveAttribute("data-scope", "chapter-1");
    expect(conversation).toContainElement(screen.getByTestId("ask-bridge"));
    expect(conversation).toContainElement(entry());
    expect(screen.getAllByTestId("ask-conversation")).toHaveLength(1);
    who.chapterId = "chapter-2";
    view.rerender(
      <AskHost>
        <Page />
      </AskHost>,
    );
    expect(screen.getByTestId("ask-conversation")).toHaveAttribute(
      "data-scope",
      "chapter-2",
    );
  });

  // The last column is what a channel's composer is told (#4713): `no` and
  // a message naming `@Frapp` is ordinary text; `unknown` and it is held,
  // because the member may turn out to have Ask.
  it.each([
    ["the server has no AI", () => (who.available = false), "no"],
    [
      "the server has not answered yet",
      () => (who.available = undefined),
      "unknown",
    ],
    ["the president has Ask off", () => (who.ask = false), "no"],
    [
      "the chapter's switches have not loaded",
      () => (who.ask = undefined),
      "unknown",
    ],
    [
      "the member's role may not use AI",
      () => (who.permissions = ["chat:send"]),
      "no",
    ],
    [
      "the member's permissions have not loaded",
      () => (who.permissions = undefined),
      "unknown",
    ],
    [
      "the member's role may not use AI, before the server has answered",
      () => {
        who.available = undefined;
        who.ask = undefined;
        who.permissions = ["chat:send"];
      },
      "no",
    ],
    [
      "an officer is viewing the chapter as a role",
      () => (who.previewing = true),
      "no",
    ],
  ])(
    "is nobody else: no way in and no conversation when %s",
    (_, set, access) => {
      set();
      render(
        <AskHost>
          <Page />
        </AskHost>,
      );
      expect(entry()).toBeNull();
      expect(bridge.access.at(-1)).toBe(access);
      // And nothing stands in for it: no "not ready" control anywhere.
      expect(screen.queryByRole("button")).toBeNull();
    },
  );

  it("does not ask for the chapter's AI switches until the server says it has AI", () => {
    who.available = undefined;
    render(
      <AskHost>
        <Page />
      </AskHost>,
    );
    expect(who.settingsEnabled.every((enabled) => !enabled)).toBe(true);
  });

  it("has no way in outside a host: a field on a page with no Ask only searches", () => {
    render(<Page />);
    expect(entry()).toBeNull();
  });
});

describe("the way in", () => {
  const host = () => (
    <AskHost>
      <Page />
    </AskHost>
  );

  it("opens the Ask page from anywhere else", async () => {
    nav.pathname = "/events";
    render(host());
    expect(screen.getByRole("status")).toHaveTextContent("closed");
    await userEvent.setup().click(entry()!);
    expect(nav.push).toHaveBeenCalledWith("/ask");
  });

  it("is open on the Ask page, where it hands focus to the page's field instead of opening it again", async () => {
    nav.pathname = "/ask";
    render(
      <AskHost>
        <Page />
        <textarea data-ask-field="" aria-label="field" />
      </AskHost>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("open");
    await userEvent.setup().click(entry()!);
    expect(nav.push).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "field" })).toHaveFocus();
  });

  it("takes a member who loses Ask on the Ask page to chat", () => {
    nav.pathname = "/ask";
    const view = render(host());
    expect(nav.replace).not.toHaveBeenCalled();
    who.previewing = true;
    view.rerender(host());
    expect(nav.replace).toHaveBeenCalledWith("/chat");
  });

  it("waits on the Ask page while whether the member has Ask is still being read", () => {
    nav.pathname = "/ask";
    who.permissions = undefined;
    render(host());
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("leaves every other page alone when the member has no Ask", () => {
    nav.pathname = "/events";
    who.previewing = true;
    render(host());
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("knows the Ask page by its route", () => {
    expect(isAskRoute("/ask")).toBe(true);
    expect(isAskRoute("/ask/later")).toBe(true);
    expect(isAskRoute("/asked")).toBe(false);
    expect(isAskRoute("/chat")).toBe(false);
    expect(isAskRoute(null)).toBe(false);
  });
});
