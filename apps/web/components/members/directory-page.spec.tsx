import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * #4175: the Directory's List/Grid toggle sits in the tab row, one pick for
 * both tabs. The lists themselves have their own specs; here they only say
 * which layout they were handed.
 */

vi.mock("next/navigation", async () => ({
  useSearchParams: (await import("@/tests/address-search-params"))
    .useAddressSearchParams,
}));
// The active tenant is a chapter here; councils have their own cases (#5933).
vi.mock("@/lib/hooks/use-tenant-kind", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hooks/use-tenant-kind")>()),
  useTenantKind: () => "chapter",
  useIsCouncil: () => false,
  useTenantIdentity: () => ({ kind: "chapter", councilType: null }),
}));

vi.mock("@repo/hooks", () => ({ useViewerUserId: () => "viewer-1" }));

function LayoutProbe({ tab }: { tab: string }) {
  // Reads the same store the real lists do.
  const [layout] = useListLayout("directory");
  return <p data-testid={`${tab}-layout`}>{layout}</p>;
}

vi.mock("@/components/members/members-directory", () => ({
  MembersDirectory: () => <LayoutProbe tab="actives" />,
}));
vi.mock("@/components/alumni/alumni-directory", () => ({
  AlumniDirectory: () => <LayoutProbe tab="alumni" />,
}));

import { useListLayout } from "@/lib/list-layout";
import { DirectoryPage } from "@/components/members/directory-page";

afterEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/members");
});

describe("DirectoryPage's tabs in the address (#6046)", () => {
  it("pushes Alumni, and Back returns to Members", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/members");
    render(<DirectoryPage />);
    const push = vi.spyOn(window.history, "pushState");
    await user.click(screen.getByRole("tab", { name: /alumni/i }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?tab=alumni");
    expect(await screen.findByTestId("alumni-layout")).toBeInTheDocument();
    push.mockRestore();
    act(() => window.history.back());
    expect(await screen.findByTestId("actives-layout")).toBeInTheDocument();
  });
});

describe("DirectoryPage's List/Grid toggle (#4175)", () => {
  it("sits in the tab row and lays out the list under it", async () => {
    const user = userEvent.setup();
    render(<DirectoryPage />);

    const toggle = await screen.findByRole("radiogroup", { name: "Layout" });
    // Beside the tabs, not inside one tab's panel.
    const tabs = screen.getByRole("tablist");
    expect(tabs.parentElement).toBe(toggle.parentElement);

    expect(screen.getByTestId("actives-layout")).toHaveTextContent("list");
    await user.click(within(toggle).getByRole("radio", { name: "Grid" }));
    expect(screen.getByTestId("actives-layout")).toHaveTextContent("grid");
    expect(window.localStorage.getItem("frapp.directory.layout.viewer-1")).toBe(
      "grid",
    );
  });
});
