import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The Settings page's own save handlers for the Chapter fields that save on
 * their own (#6033): `saveProfileField` (the profile PATCH) and `patchConfig`
 * (the config PATCH). `settings-org-tab.spec.tsx` pins the fields against a
 * stubbed `onSave`; this renders the real page so a handler that reported a
 * failed save as landed would show "Saved" and drop the officer's text.
 */

const { search, updateChapter, patchConfig, toast } = vi.hoisted(() => ({
  search: { current: "tab=org" },
  updateChapter: vi.fn(),
  patchConfig: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@repo/hooks", async () =>
  (await import("@/tests/settings-harness")).settingsHooks({
    currentChapter: () => ({
      data: {
        name: "Tau Nu",
        university: "Rensselaer Polytechnic Institute",
        subscription_status: "active",
        past_due_since: null,
      },
      isPending: false,
      isError: false,
    }),
    permissions: () => ["*"],
    orgConfig: () => ({
      org_archetype: "ifc",
      branding: { designation: "Tau Nu" },
    }),
    overrides: {
      useUpdateChapter: () => ({
        mutateAsync: updateChapter,
        isPending: false,
      }),
      usePatchOrgConfig: () => ({
        mutateAsync: patchConfig,
        isPending: false,
      }),
    },
  }),
);

vi.mock("@/lib/stores/chapter-store", async () =>
  (await import("@/tests/settings-harness")).chapterStore(),
);

vi.mock("next/navigation", async () =>
  (await import("@/tests/settings-harness")).navigation(
    () => new URLSearchParams(search.current),
  ),
);

vi.mock("@/components/shared/can", async () =>
  (await import("@/tests/settings-harness")).canPassThrough(),
);

vi.mock("@/lib/hooks/use-toast", async () =>
  (await import("@/tests/settings-harness")).toastStub(toast),
);

const { SettingsPage } = await import("./settings-page");

describe("the Settings page's autosave handlers report a failed save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("leaves no Saved and keeps the typed text when the profile save fails", async () => {
    search.current = "tab=org";
    updateChapter.mockRejectedValue(new Error("Network down"));
    const user = userEvent.setup();
    render(<SettingsPage />);
    const field = screen.getByLabelText(/chapter name/i);

    await user.type(field, " II");
    await user.tab();

    await waitFor(() =>
      expect(updateChapter).toHaveBeenCalledWith({ name: "Tau Nu II" }),
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't save chapter profile" }),
      ),
    );
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(field).toHaveValue("Tau Nu II");
  });

  it("leaves no Saved and keeps the typed text when the config save fails", async () => {
    search.current = "tab=org&page=identity";
    patchConfig.mockRejectedValue(new Error("Network down"));
    const user = userEvent.setup();
    render(<SettingsPage />);
    const field = screen.getByLabelText(/chapter designation/i);

    await user.type(field, " II");
    await user.tab();

    await waitFor(() =>
      expect(patchConfig).toHaveBeenCalledWith({
        branding: { designation: "Tau Nu II" },
      }),
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't save settings" }),
      ),
    );
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(field).toHaveValue("Tau Nu II");
  });
});
