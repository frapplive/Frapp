import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

/*
 * New's forms under Frapp Intelligence's field (#5946): the shared list, in
 * its order, for what this member's role and chapter allow, each a link to
 * its page's own form.
 */

const who = vi.hoisted(() => ({
  permissions: ["*"] as string[] | undefined,
  modules: undefined as Record<string, boolean> | undefined,
}));
vi.mock("@repo/hooks", () => ({
  useMyPermissions: () => ({
    data: who.permissions ? { permissions: who.permissions } : undefined,
  }),
  useCurrentChapter: () => ({
    data: who.modules ? { enabled_modules: who.modules } : undefined,
  }),
}));
vi.mock("@/lib/stores/chapter-store", () => ({
  useChapterStore: (selector: (s: { activeChapterId: string }) => unknown) =>
    selector({ activeChapterId: "chap-1" }),
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a {...props}>{children}</a>,
}));

import { NewActions } from "./new-actions";

const actions = () =>
  within(screen.getByRole("list", { name: "Start something new" }))
    .getAllByRole("link")
    .map((link) => [link.textContent, link.getAttribute("href")]);

describe("NewActions (#5946)", () => {
  beforeEach(() => {
    who.permissions = ["*"];
    who.modules = undefined;
  });

  it("draws what a browser can start, in the shared order, each opening its page's own form", () => {
    render(<NewActions />);
    expect(actions()).toEqual([
      ["New minutes", "/meetings?new=1"],
      ["New event", "/events?new=1"],
      ["New task", "/tasks?new=1"],
      ["New message", "/messages?new=1"],
      ["Log hours", "/service?new=1"],
      ["Upload", "/documents?new=1"],
    ]);
  });

  it("offers a member only what their role starts", () => {
    who.permissions = ["members:view", "service:log"];
    render(<NewActions />);
    expect(actions().map(([label]) => label)).toEqual([
      "New message",
      "Log hours",
    ]);
  });

  it("drops an action whose module the chapter turned off", () => {
    who.modules = { events: false };
    render(<NewActions />);
    expect(actions().map(([label]) => label)).not.toContain("New event");
  });

  it("draws nothing, not an empty row, for a role that starts nothing", () => {
    who.permissions = [];
    const { container } = render(<NewActions />);
    expect(container).toBeEmptyDOMElement();
  });
});
