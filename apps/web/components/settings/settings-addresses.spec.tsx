import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chapterSubscription } from "@/tests/chapter-subscription";
import { ADDRESS_FROM_KEY } from "@/lib/address/address";

/**
 * Chapter settings' addresses (#6049; `spec/ui/web-dashboard/README.md`
 * § Addresses): a rail row is a step Back returns from, and a page opened in
 * place from a row is pushed marked with where it came from, so its back
 * arrow goes Back.
 */

const { mockCurrentChapter } = vi.hoisted(() => ({
  mockCurrentChapter: vi.fn(),
}));

vi.mock("@repo/hooks", async () =>
  (await import("@/tests/settings-harness")).settingsHooks({
    currentChapter: () => mockCurrentChapter(),
    permissions: () => ["*"],
  }),
);

vi.mock("@/lib/stores/chapter-store", async () =>
  (await import("@/tests/settings-harness")).chapterStore(),
);

vi.mock("next/navigation", async () =>
  (await import("@/tests/settings-harness")).navigation(
    () => new URLSearchParams(window.location.search),
  ),
);

vi.mock("@/components/shared/can", async () =>
  (await import("@/tests/settings-harness")).canPassThrough(),
);

vi.mock("@/lib/hooks/use-toast", async () =>
  (await import("@/tests/settings-harness")).toastStub(),
);

const { SettingsPage } = await import("./settings-page");

const chapter = chapterSubscription(mockCurrentChapter);

function here(): string {
  return `${window.location.pathname}${window.location.search}`;
}

describe("Chapter settings addresses (#6049)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chapter.active();
    window.history.replaceState(null, "", "/settings?tab=org");
  });
  afterEach(() => vi.restoreAllMocks());

  it("pushes a rail row, as a sibling of the row before", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    const push = vi.spyOn(window.history, "pushState");
    await user.click(screen.getByRole("tab", { name: /^privacy$/i }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(here()).toBe("/settings?tab=privacy");
    expect(window.history.state[ADDRESS_FROM_KEY]).toEqual([]);
    expect(screen.getByRole("tab", { name: /^privacy$/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("moves focus along the rail with the arrow keys without opening a row", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    screen.getByRole("tab", { name: /^chapter$/i }).focus();
    await user.keyboard("{ArrowDown}");
    expect(here()).toBe("/settings?tab=org");
  });

  it("pushes a page a row opens, and its back arrow goes Back", async () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("link", { name: /^accent color/i }));
    expect(here()).toBe("/settings?tab=org&page=accent");
    expect(window.history.state[ADDRESS_FROM_KEY]).toEqual([
      "/settings?tab=org",
    ]);
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    fireEvent.click(await screen.findByRole("link", { name: /^chapter$/i }));
    expect(go).toHaveBeenCalledWith(-1);
  });

  it("closes the page open inside the lit row when the row is clicked", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("link", { name: /^accent color/i }));
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    await user.click(screen.getByRole("tab", { name: /^chapter$/i }));
    expect(go).toHaveBeenCalledWith(-1);
  });
});
