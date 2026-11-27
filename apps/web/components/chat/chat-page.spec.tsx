/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/chat", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/lib/chat/chat-provider", () => ({
  ChatProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./chat-shell", () => ({
  ChatShell: ({
    initialChannelId,
    initialMessageId,
    initialThreadId,
    addressed,
  }: {
    initialChannelId: string | null;
    initialMessageId: string | null;
    initialThreadId: string | null;
    addressed: boolean;
  }) => (
    <>
      <p data-testid="target">
        {String(initialChannelId)}/{String(initialMessageId)}
      </p>
      <p data-testid="thread">{String(initialThreadId)}</p>
      <p data-testid="addressed">{String(addressed)}</p>
    </>
  ),
}));

import { ChatPage } from "./chat-page";

afterEach(() => {
  nav.pathname = "/chat";
  nav.search = "";
});

describe("ChatPage's target (#3779)", () => {
  it("reads the thread and lets the panel write the address on a chat URL (#6041)", () => {
    nav.search = "channel=c1&thread=t1";
    const { rerender } = render(<ChatPage />);
    expect(screen.getByTestId("thread")).toHaveTextContent("t1");
    expect(screen.getByTestId("addressed")).toHaveTextContent("true");
    // Forward onto another thread while mounted.
    nav.search = "channel=c1&thread=t2";
    rerender(<ChatPage />);
    expect(screen.getByTestId("thread")).toHaveTextContent("t2");
  });

  it("writes no address beside a tool page (#5575)", () => {
    nav.pathname = "/documents";
    nav.search = "folder=Finance";
    render(<ChatPage toolBeside />);
    expect(screen.getByTestId("addressed")).toHaveTextContent("false");
  });

  it("follows a chat URL's channel and message", () => {
    nav.search = "channel=c1&message=m1";
    render(<ChatPage />);
    expect(screen.getByTestId("target")).toHaveTextContent("c1/m1");
  });

  it("ignores a tool page's own ?channel=, and keeps the target it had", () => {
    nav.search = "channel=c1";
    const { rerender } = render(<ChatPage toolBeside />);
    // The channel editor uses the same parameter name.
    nav.pathname = "/chat-admin";
    nav.search = "channel=c9";
    rerender(<ChatPage toolBeside />);
    expect(screen.getByTestId("target")).toHaveTextContent("c1/null");
    nav.pathname = "/events";
    nav.search = "";
    rerender(<ChatPage toolBeside />);
    expect(screen.getByTestId("target")).toHaveTextContent("c1/null");
  });

  it("starts with no target when it mounts beside a tool", () => {
    nav.pathname = "/chat-admin";
    nav.search = "channel=c9";
    render(<ChatPage toolBeside />);
    expect(screen.getByTestId("target")).toHaveTextContent("null/null");
  });
});
