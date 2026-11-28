import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Council settings' rail moves the address as Chapter settings' does
 * (#6049; `spec/ui/web-dashboard/README.md` § Addresses): a row is a step
 * Back returns from, the lit row closes a page opened inside it, and an old
 * alias is written as its row in place.
 */

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useCurrentChapter: () => ({
    data: { id: "council-1", name: "Panhellenic", tenant_kind: "council" },
    isError: false,
  }),
  useMyPermissions: () => ({ data: { permissions: ["*"] } }),
}));

vi.mock("@/lib/stores/chapter-store", async () =>
  (await import("@/tests/settings-harness")).chapterStore(),
);

vi.mock("next/navigation", async () => ({
  useSearchParams: (await import("@/tests/address-search-params"))
    .useAddressSearchParams,
}));

// The rows' own bodies have their own specs; here each only has to be the
// row on screen.
vi.mock("@/components/settings/settings-roles-tab", () => ({
  SettingsRolesTab: () => <p>Roles and groups body</p>,
}));
vi.mock("@/components/settings/settings-logs-tab", () => ({
  SettingsLogsTab: () => <p>Logs body</p>,
}));

const { CouncilSettingsPage } = await import("./council-settings-page");
const { setAddress } = await import("@/tests/address-search-params");

const here = () => `${window.location.pathname}${window.location.search}`;

describe("council settings' address", () => {
  beforeEach(() => setAddress("/settings?tab=roles"));
  afterEach(() => vi.restoreAllMocks());

  it("pushes a rail row, without the page open in the last one", async () => {
    const user = userEvent.setup();
    setAddress("/settings?tab=roles&role=r1");
    render(<CouncilSettingsPage />);
    const push = vi.spyOn(window.history, "pushState");
    await user.click(screen.getByRole("tab", { name: /^logs$/i }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(here()).toBe("/settings?tab=logs");
    expect(screen.getByText("Logs body")).toBeInTheDocument();
  });

  it("closes a role's page when the lit Roles and groups row is clicked", async () => {
    const user = userEvent.setup();
    setAddress("/settings?tab=roles&role=r1");
    render(<CouncilSettingsPage />);
    await user.click(screen.getByRole("tab", { name: /^roles and groups$/i }));
    expect(here()).toBe("/settings?tab=roles");
  });

  it("writes an old alias as its row in place (?tab=groups is Roles and groups)", async () => {
    setAddress("/settings?tab=groups");
    const push = vi.spyOn(window.history, "pushState");
    render(<CouncilSettingsPage />);
    await waitFor(() => expect(here()).toBe("/settings?tab=roles"));
    expect(push).not.toHaveBeenCalled();
  });
});
