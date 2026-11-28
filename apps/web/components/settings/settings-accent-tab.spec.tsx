import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import type { useUpdateChapter } from "@repo/hooks";

vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const { SettingsAccentTab, useAccentDraft } =
  await import("./settings-accent-tab");

/** The chapter read, held stable so the draft seeds once. */
const CHAPTER = { accent_color: "#123456" };

function AccentTab({ mutateAsync }: { mutateAsync: ReturnType<typeof vi.fn> }) {
  const draft = useAccentDraft(CHAPTER);
  return (
    <SettingsAccentTab
      draft={draft}
      canEditProfile
      updateChapter={
        { mutateAsync, isPending: false } as unknown as ReturnType<
          typeof useUpdateChapter
        >
      }
    />
  );
}

/** A save that waits until the test lets it land. */
function deferredSaves() {
  const pending: Array<() => void> = [];
  const mutateAsync = vi.fn(
    () =>
      new Promise((resolve) => {
        pending.push(() => resolve({ failedContrastChecks: null }));
      }),
  );
  return { mutateAsync, land: () => pending.shift()?.() };
}

const hexField = () => screen.getByLabelText("Accent color hex value");

describe("SettingsAccentTab's own saves (#6033)", () => {
  it("puts the stored accent back on Escape, and sends nothing", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({});
    render(<AccentTab mutateAsync={mutateAsync} />);
    await user.clear(hexField());
    await user.type(hexField(), "#ABCDEF");
    await user.keyboard("{Escape}");
    expect(hexField()).toHaveValue("#123456");
    await user.tab();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("saves a hex committed while the first save is on its way once that one lands", async () => {
    const user = userEvent.setup();
    const { mutateAsync, land } = deferredSaves();
    render(<AccentTab mutateAsync={mutateAsync} />);

    await user.clear(hexField());
    await user.type(hexField(), "#AA0000{Enter}");
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenLastCalledWith({ accent_color: "#AA0000" });

    await user.clear(hexField());
    await user.type(hexField(), "#00AA00{Enter}");
    // Held, not sent alongside, and not dropped.
    expect(mutateAsync).toHaveBeenCalledTimes(1);

    await act(async () => land());
    expect(mutateAsync).toHaveBeenCalledTimes(2);
    expect(mutateAsync).toHaveBeenLastCalledWith({ accent_color: "#00AA00" });
    await act(async () => land());
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("saves the colour picker's pick on its native change event, not on each drag", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    render(<AccentTab mutateAsync={mutateAsync} />);
    const picker = screen.getByLabelText(
      "Accent color picker",
    ) as HTMLInputElement;

    // Dragging through the picker fires `input`: the draft moves, nothing saves.
    fireEvent.input(picker, { target: { value: "#336699" } });
    expect(hexField()).toHaveValue("#336699");
    expect(mutateAsync).not.toHaveBeenCalled();

    // Closing the picker commits the pick with a native `change`, and focus
    // may never have been on the input, so no blur follows.
    await act(async () => {
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({ accent_color: "#336699" });
  });
});
