import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADDRESS_FROM_KEY } from "@/lib/address/address";
import { chapterSubscription } from "@/tests/chapter-subscription";

/**
 * Chapter settings' address (#6049; `spec/ui/web-dashboard/README.md`
 * § Addresses): every rail row and every page opened in place is a step
 * Back returns from, and a page's back arrow closes by the address's rule.
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

// Roles and groups' own body has its own specs; here it only has to be the
// row on screen.
vi.mock("@/components/settings/settings-roles-tab", () => ({
  SettingsRolesTab: () => <p>Roles and groups body</p>,
}));

const { SettingsPage } = await import("./settings-page");

const chapter = chapterSubscription(mockCurrentChapter);
const here = () => `${window.location.pathname}${window.location.search}`;
const accentRow = () => screen.getByRole("link", { name: /^accent color/i });
const backToChapter = () => screen.getByRole("link", { name: /^chapter$/i });

describe("Chapter settings' address", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chapter.active();
    window.history.replaceState(null, "", "/settings?tab=org");
  });
  afterEach(() => vi.restoreAllMocks());

  it("pushes a rail row, without the page open in the last one", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/settings?tab=org&page=accent");
    render(<SettingsPage />);
    const push = vi.spyOn(window.history, "pushState");
    await user.click(screen.getByRole("tab", { name: /^privacy$/i }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(here()).toBe("/settings?tab=privacy");
    expect(screen.getByRole("tab", { name: /^privacy$/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("follows Back onto the row it left", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.click(screen.getByRole("tab", { name: /^privacy$/i }));
    window.history.back();
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /^chapter$/i })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(here()).toBe("/settings?tab=org");
  });

  it("opens a row's page with a marked push, and its back arrow goes Back", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.click(accentRow());
    expect(here()).toBe("/settings?tab=org&page=accent");
    expect(window.history.state).toMatchObject({
      [ADDRESS_FROM_KEY]: ["/settings?tab=org"],
    });
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    await user.click(backToChapter());
    expect(go).toHaveBeenCalledWith(-1);
  });

  it("closes a page that arrived from a link by replacing it with its parent", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/settings?tab=org&page=accent");
    render(<SettingsPage />);
    const go = vi.spyOn(window.history, "go");
    const push = vi.spyOn(window.history, "pushState");
    await user.click(backToChapter());
    expect(go).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(here()).toBe("/settings?tab=org");
    expect(accentRow()).toBeInTheDocument();
  });

  it("closes a page opened in place when its lit row is clicked", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.click(accentRow());
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    await user.click(screen.getByRole("tab", { name: /^chapter$/i }));
    expect(go).toHaveBeenCalledWith(-1);
  });

  it("writes the row into a bare /settings in place, so a page opened from it closes Back", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/settings");
    const push = vi.spyOn(window.history, "pushState");
    render(<SettingsPage />);
    await waitFor(() => expect(here()).toBe("/settings?tab=org"));
    expect(push).not.toHaveBeenCalled();
    await user.click(accentRow());
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    await user.click(backToChapter());
    expect(go).toHaveBeenCalledWith(-1);
  });

  it("writes an old alias as its row in place (?tab=groups is Roles and groups)", async () => {
    window.history.replaceState(null, "", "/settings?tab=groups");
    render(<SettingsPage />);
    await waitFor(() => expect(here()).toBe("/settings?tab=roles"));
  });

  it("closes a role's page when the lit Roles and groups row is clicked", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/settings?tab=roles&role=r1");
    render(<SettingsPage />);
    await user.click(screen.getByRole("tab", { name: /^roles and groups$/i }));
    expect(here()).toBe("/settings?tab=roles");
  });

  it("pushes nothing while the arrow keys move along the rail; Enter picks a row", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    const push = vi.spyOn(window.history, "pushState");
    screen.getByRole("tab", { name: /^chapter$/i }).focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).not.toBe(
      screen.getByRole("tab", { name: /^chapter$/i }),
    );
    expect(push).not.toHaveBeenCalled();
    expect(here()).toBe("/settings?tab=org");
    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("leaves a modified click to the link, for a new tab", async () => {
    render(<SettingsPage />);
    const push = vi.spyOn(window.history, "pushState");
    const row = accentRow();
    // jsdom can't open a tab; the point is that the page doesn't move.
    row.addEventListener("click", (event) => event.preventDefault());
    row.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true }),
    );
    expect(push).not.toHaveBeenCalled();
    expect(here()).toBe("/settings?tab=org");
  });
});
