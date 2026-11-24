import { afterEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { hidden } = vi.hoisted(() => ({
  hidden: { features: new Set<string>(), calls: [] as unknown[][] },
}));

// The live-meeting card has its own spec (#5219).
vi.mock("@/components/meetings/live-meeting-card", () => ({
  LiveMeetingCard: () => null,
}));

vi.mock("@repo/hooks", () => ({
  useAccessibleChapters: () => ({ data: [], isSuccess: true }),
  useCurrentChapter: () => ({ data: undefined, isError: false }),
  useMyPermissions: () => ({ data: undefined }),
  // The rule itself is pinned in `@repo/hooks` (`unset-features.spec.tsx`).
  useHiddenUnsetFeatures: (...args: unknown[]) => {
    hidden.calls.push(args);
    return hidden.features;
  },
}));
vi.mock("@/lib/auth/select-chapter", () => ({
  useSelectChapter: () => vi.fn(),
}));
vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("@/lib/stores/chapter-store", () => ({
  useChapterStore: (
    selector: (s: { activeChapterId: string | null }) => unknown,
  ) => selector({ activeChapterId: "chap-1" }),
}));

const askEntry = vi.hoisted(() => ({
  current: null as null | {
    open: boolean;
    openAsk: () => void;
    keptDraft: () => string;
    keepDraft: (text: string) => void;
  },
}));
vi.mock("@/components/ask/ask-host", () => ({
  useAskEntry: () => askEntry.current,
}));

import { AppNav } from "./app-nav";
import { FOCUS_RING_SHELL } from "@/components/ui/focus";

/** Enough to see every row, including Directory. */
const OFFICER: readonly string[] = [
  "members:view",
  "billing:view",
  "roles:manage",
  "geofences:manage",
  "reports:export",
  "channels:manage",
  "chapter-config:view",
];

function renderNav(props: Partial<React.ComponentProps<typeof AppNav>> = {}) {
  return render(
    <AppNav
      collapsed={false}
      permissions={OFFICER}
      pathname="/events"
      {...props}
    />,
  );
}

describe("AppNav", () => {
  afterEach(() => {
    askEntry.current = null;
  });

  it("orders the IA the way the board does", () => {
    const { container } = renderNav();
    // Headings are <p>, rows are <a>. Matching on text alone would also catch
    // the "Directory" row label, which is exactly the word this test is
    // asserting does NOT appear as a heading.
    const headings = Array.from(container.querySelectorAll("nav p")).map(
      (el) => el.textContent,
    );
    // Directory and Finance were two one-item sections whose headings each
    // restated the row beneath them; the board merges them into one unlabeled
    // group, so neither word may appear as a heading. The Admin group folded
    // into Chapter settings (#2946), so its heading is gone too. Resources is
    // one row since #5949, so its heading would only repeat it.
    expect(headings).toEqual(["Chapter"]);
  });

  it("keeps Chat ungrouped and first", () => {
    renderNav();
    const chat = screen.getByRole("link", { name: "Chat" });
    expect(chat).toBeInTheDocument();
    // Chat is the app's home, not a member of any group.
    const headings = Array.from(document.querySelectorAll("nav p")).map(
      (el) => el.textContent,
    );
    expect(headings).not.toContain("Chat");
  });

  it("still shows Directory without a heading, and no Billing row (#3827)", () => {
    renderNav();
    expect(screen.getByRole("link", { name: "Directory" })).toBeInTheDocument();
    // Billing is Chapter settings' Plan and billing row now.
    expect(screen.queryByRole("link", { name: "Billing" })).toBeNull();
  });

  it("has no officer rows: Chapter settings opens from the chapter menu", () => {
    // One door, not two (Paul, 2026-11-19): the chapter menu atop the nav
    // holds Chapter settings (`chapter-nav-header.tsx`, where its gating is
    // pinned), so no row in the list repeats it.
    renderNav();
    const rows = Array.from(document.querySelectorAll("nav a")).map(
      (el) => el.textContent,
    );
    expect(rows.at(-1)).toBe("Directory");
    for (const gone of [
      "Chapter settings",
      "Roles",
      "Study Zones",
      "Reports",
      "Chat Admin",
      "Discord Import",
    ]) {
      expect(rows).not.toContain(gone);
    }
  });

  it("draws no permission-gated row while permissions are unresolved (#3854)", () => {
    // Failing open drew officer rows for every member on every reload,
    // clickable, until the permission read answered and took them back.
    {
      const { unmount } = renderNav({ permissions: undefined });
      for (const gated of ["Directory"]) {
        expect(
          screen.queryByRole("link", { name: gated }),
        ).not.toBeInTheDocument();
      }
      // Rows with no permission rule render at once.
      expect(screen.getByRole("link", { name: "Events" })).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Resources" }),
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("keeps gated rows when the offline dashboard can't ask (null)", () => {
    // A check that could not run is not a denial (design-system §5 rule 4):
    // a member keeps the Directory row they hold, and the page states the outage.
    renderNav({ permissions: null });
    expect(screen.getByRole("link", { name: "Directory" })).toBeInTheDocument();
  });

  it("draws the gated rows once an officer's permissions answer", () => {
    const { rerender } = renderNav({ permissions: undefined });
    expect(
      screen.queryByRole("link", { name: "Directory" }),
    ).not.toBeInTheDocument();
    rerender(
      <AppNav collapsed={false} permissions={OFFICER} pathname="/events" />,
    );
    expect(screen.getByRole("link", { name: "Directory" })).toBeInTheDocument();
  });

  it("hides a row whose module is switched off", () => {
    renderNav({ isModuleEnabled: (key: string) => key !== "events" });
    expect(
      screen.queryByRole("link", { name: "Events" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tasks" })).toBeInTheDocument();
  });

  it("drops a row nobody has set up, from a member who can't set it up", () => {
    hidden.features = new Set(["study", "documents"]);
    try {
      renderNav({ permissions: ["members:view", "backwork:upload"] });
      const rows = Array.from(document.querySelectorAll("nav a")).map(
        (el) => el.textContent,
      );
      expect(rows).not.toContain("Study hours");
      // Service hours shares Study's module, and members log their own.
      expect(rows).toContain("Service hours");
      // Resources holds minutes and Backwork too, so an empty library
      // doesn't hide it (#5949).
      expect(rows).toContain("Resources");
    } finally {
      hidden.features = new Set();
    }
  });

  it("asks the setup gate with the nav's own permissions and module gate", () => {
    const gate = (key: string) => key !== "polls";
    renderNav({ permissions: ["members:view"], isModuleEnabled: gate });
    expect(hidden.calls.at(-1)).toEqual([["members:view"], gate]);
  });

  // #5949, #2956: Meetings, Documents and Backwork are one Resources row.
  it("draws one Resources row in place of Meetings, Documents and Backwork", () => {
    renderNav({ permissions: ["members:view", "backwork:upload"] });
    const rows = Array.from(document.querySelectorAll("nav a")).map(
      (el) => el.textContent,
    );
    expect(rows).toContain("Resources");
    for (const gone of ["Meetings", "Documents", "Backwork"]) {
      expect(rows).not.toContain(gone);
    }
    expect(screen.getByRole("link", { name: "Resources" })).toHaveAttribute(
      "href",
      "/documents",
    );
  });

  it("keeps Resources while any of its modules is on, and drops it when all three are off", () => {
    const { unmount } = renderNav({
      isModuleEnabled: (key) => key === "backwork",
    });
    expect(screen.getByRole("link", { name: "Resources" })).toBeInTheDocument();
    unmount();
    renderNav({
      isModuleEnabled: (key) =>
        !["documents", "meetings", "backwork"].includes(key),
    });
    expect(
      screen.queryByRole("link", { name: "Resources" }),
    ).not.toBeInTheDocument();
  });

  it("lights Resources on Backwork and on a meeting's minutes, the pages under it", () => {
    for (const pathname of ["/backwork", "/backwork/upload", "/meetings/abc"]) {
      const { unmount } = renderNav({ pathname });
      expect(screen.getByRole("link", { name: "Resources" })).toHaveAttribute(
        "aria-current",
        "true",
      );
      unmount();
    }
    renderNav({ pathname: "/documents" });
    expect(screen.getByRole("link", { name: "Resources" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("marks the active route", () => {
    renderNav({ pathname: "/events" });
    expect(screen.getByRole("link", { name: "Events" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("drops labels in the rail but keeps every row reachable by name", () => {
    renderNav({ collapsed: true });
    const events = screen.getByRole("link", { name: "Events" });
    expect(events).toBeInTheDocument();
    // The visible text is gone; the accessible name is not.
    expect(events).not.toHaveTextContent("Events");
    // Section headings have nowhere to render at 56px.
    expect(document.querySelectorAll("nav p")).toHaveLength(0);
  });

  it("offers a collapse toggle in the column and none in the drawer", () => {
    const onToggleCollapsed = vi.fn();
    const { unmount } = renderNav({ onToggleCollapsed });
    expect(
      screen.getByRole("button", { name: /collapse sidebar/i }),
    ).toBeInTheDocument();
    unmount();

    // On /chat the column passes no handler, because the rail does not apply.
    const second = renderNav();
    expect(
      screen.queryByRole("button", { name: /collapse sidebar/i }),
    ).not.toBeInTheDocument();
    second.unmount();

    renderNav({ variant: "drawer", onToggleCollapsed });
    expect(
      screen.queryByRole("button", { name: /collapse sidebar/i }),
    ).not.toBeInTheDocument();
  });

  it("holds Frapp Intelligence at its foot, the crest alone in the rail (#5560)", () => {
    askEntry.current = {
      open: false,
      openAsk: vi.fn(),
      keptDraft: () => "",
      keepDraft: vi.fn(),
    };
    const { unmount } = renderNav({ onToggleCollapsed: vi.fn() });
    const ask = screen.getByRole("button", { name: "Frapp Intelligence" });
    expect(ask).toHaveTextContent("Frapp Intelligence");
    // One foot row: Ask fills it and the toggle is a glyph at its end, named
    // by its label and tooltip, so a full sidebar still fits 1024x768.
    const collapse = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(ask.parentElement).toBe(collapse.parentElement);
    expect(
      ask.compareDocumentPosition(collapse) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(collapse).not.toHaveTextContent("Collapse sidebar");
    expect(collapse).toHaveAttribute("title", "Collapse sidebar");
    expect(ask).toHaveClass("h-[34px]");
    unmount();

    // With no toggle passed, the rail still has its place.
    const { unmount: unmountRail } = renderNav({ collapsed: true });
    const crest = screen.getByRole("button", { name: "Frapp Intelligence" });
    expect(crest).not.toHaveTextContent("Frapp Intelligence");
    expect(crest).toHaveAttribute("title", "Frapp Intelligence");
    expect(crest).not.toHaveAttribute("aria-current");
    // The crest opens the Ask page, as the bar does.
    fireEvent.click(crest);
    expect(askEntry.current!.openAsk).toHaveBeenCalledTimes(1);
    unmountRail();

    // On the Ask page the crest is marked as the page on screen.
    askEntry.current = {
      open: true,
      openAsk: vi.fn(),
      keptDraft: () => "",
      keepDraft: vi.fn(),
    };
    const { unmount: unmountOpen } = renderNav({ collapsed: true });
    expect(screen.getByRole("button", { name: "Frapp Intelligence" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    unmountOpen();

    // The drawer has none; below `lg` the page floats its own.
    renderNav({ variant: "drawer" });
    expect(
      screen.queryByRole("button", { name: "Frapp Intelligence" }),
    ).not.toBeInTheDocument();
  });

  it("adds no box at the foot for a member without Ask (#5560)", () => {
    const { container } = renderNav({ onToggleCollapsed: vi.fn() });
    const toggle = container.querySelector("[data-nav-toggle]");
    // The toggle pins itself down, with nothing empty above it.
    expect(toggle).toHaveClass("mt-auto");
    expect(toggle?.previousElementSibling).toBe(
      screen.getByRole("navigation", { name: "Primary" }),
    );
  });

  it("labels the collapse toggle with its action, and names it in the rail (#4044)", () => {
    const onToggleCollapsed = vi.fn();
    const { unmount } = renderNav({ onToggleCollapsed });
    const collapse = screen.getByRole("button", { name: "Collapse sidebar" });
    // Expanded, the action is visible text, not only a tooltip.
    expect(collapse).toHaveTextContent("Collapse sidebar");
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    collapse.click();
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
    unmount();

    renderNav({ collapsed: true, onToggleCollapsed });
    const expand = screen.getByRole("button", { name: "Expand sidebar" });
    // The rail has no room for the label; the name and tooltip carry it.
    expect(expand).not.toHaveTextContent("Expand sidebar");
    expect(expand).toHaveAttribute("title", "Expand sidebar");
    // The name must not lean on the tooltip, which a screen reader may skip.
    expect(expand).toHaveAttribute("aria-label", "Expand sidebar");
    expect(expand).toHaveAttribute("aria-expanded", "false");
  });

  it("draws the toggle in the row color under a hairline, in both states (#4044)", () => {
    // The old toggle was a lone `text-muted` glyph in the corner, which
    // members missed. It now reads as a nav row, set off by a hairline.
    for (const collapsed of [false, true]) {
      const { container, unmount } = renderNav({
        collapsed,
        onToggleCollapsed: vi.fn(),
      });
      const toggle = screen.getByRole("button", {
        name: collapsed ? "Expand sidebar" : "Collapse sidebar",
      });
      expect(toggle).toHaveClass("text-muted-foreground");
      expect(toggle).not.toHaveClass("text-muted");
      const hairline = container.querySelector(
        "[data-nav-toggle] > span[aria-hidden='true']",
      );
      expect(hairline).toHaveClass("h-px", "bg-border");
      expect(hairline).not.toHaveClass("hidden");
      unmount();
    }
  });

  it("keeps keyboard focus on the toggle as it flips (#4044)", () => {
    const { rerender } = renderNav({ onToggleCollapsed: vi.fn() });
    const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
    toggle.focus();
    expect(toggle).toHaveClass(...FOCUS_RING_SHELL.split(" "));
    rerender(
      <AppNav
        collapsed
        permissions={OFFICER}
        pathname="/events"
        onToggleCollapsed={vi.fn()}
      />,
    );
    // Same element, so a member who pressed Enter is still on it.
    const flipped = screen.getByRole("button", { name: "Expand sidebar" });
    expect(flipped).toBe(toggle);
    expect(flipped).toHaveFocus();
  });

  it("ignores the collapsed preference inside the drawer", () => {
    // The drawer has no room to be a rail and no toggle to leave one, so a
    // member who collapsed the desktop nav must not find an icon-only drawer.
    renderNav({ collapsed: true, variant: "drawer" });
    expect(screen.getByRole("link", { name: "Events" })).toHaveTextContent(
      "Events",
    );
  });
});
