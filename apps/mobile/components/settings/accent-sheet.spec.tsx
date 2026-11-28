import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModal: "BottomSheetModal",
  BottomSheetTextInput: "TextInput",
  BottomSheetView: "View",
}));

const state = vi.hoisted(() => ({
  save: (() => Promise.resolve()) as (body: unknown) => Promise<unknown>,
  chapter: undefined as
    | { name: string; accent_color: string; branding: Record<string, unknown> }
    | undefined,
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useCurrentChapter: () => ({ data: state.chapter, isError: false }),
  useUpdateChapter: () => ({ mutateAsync: state.save, isPending: false }),
}));

vi.mock("@/lib/chapter-branding", () => ({
  useChapterBranding: () => ({
    accent: "#CB9FFF",
    accentPrimary: "#8E4EC6",
    accentOnPrimary: "#FFFFFF",
    logoUrl: null,
    chapterName: null,
  }),
}));

import { DEFAULT_CHAPTER_ACCENT } from "@repo/hooks/chapter-identity";
import { FrappThemeProvider } from "@/lib/theme";
import { screenText } from "@/test/screen-text";
import { AccentPicker } from "@/components/chapter/accent-picker";
import { SheetPrimaryButton } from "@/components/sheet-scaffold";
import { AccentSheet, storedAccentOf } from "./accent-sheet";

describe("storedAccentOf", () => {
  it("reads branding.colors.accent first, since it is authoritative (#795)", () => {
    expect(
      storedAccentOf({
        accent_color: "#2563EB",
        branding: { colors: { accent: "#4f2683" } },
      }),
    ).toBe("#4F2683");
  });

  it("falls back to the accent_color mirror, then the house seed", () => {
    expect(storedAccentOf({ accent_color: "#c9a56f", branding: {} })).toBe(
      "#C9A56F",
    );
    expect(storedAccentOf({ accent_color: null })).toBe(DEFAULT_CHAPTER_ACCENT);
    expect(storedAccentOf(undefined)).toBe(DEFAULT_CHAPTER_ACCENT);
  });

  it("ignores a branding accent that is not a string", () => {
    expect(
      storedAccentOf({
        accent_color: "#8B0000",
        branding: { colors: { accent: 42 } },
      }),
    ).toBe("#8B0000");
  });
});

describe("AccentSheet", () => {
  it("says the color changes the app for everyone in the chapter", () => {
    // Settings is otherwise personal preferences, and this save repaints
    // every member's app; the picker alone can't say that.
    state.chapter = {
      name: "Beta Chapter",
      accent_color: "#4F2683",
      branding: {},
    };
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <FrappThemeProvider>
          <AccentSheet />
        </FrappThemeProvider>,
      );
    });

    expect(screenText(tree)).toContain(
      "Changes the color for everyone in the chapter.",
    );
    act(() => tree.unmount());
  });
});

/**
 * The accent saves on its own (#6033): a swatch the moment it is tapped, a
 * typed hex when the field is left, with "Saved" under it. The sheet stays
 * open and never dismisses itself, so a save that settles after a swipe
 * can't leave a dismissed modal stuck (#3405).
 */
describe("AccentSheet saving on its own (#6033)", () => {
  const dismiss = vi.fn();

  function open(save: (body: unknown) => Promise<unknown>) {
    state.chapter = {
      name: "Beta Chapter",
      accent_color: "#4F2683",
      branding: {},
    };
    state.save = save;
    dismiss.mockReset();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <FrappThemeProvider>
          <AccentSheet ref={React.createRef()} />
        </FrappThemeProvider>,
        {
          createNodeMock: (element) =>
            (element.type as unknown) === "BottomSheetModal"
              ? { dismiss, present: vi.fn() }
              : null,
        },
      );
    });
    const picker = () => tree.root.findByType(AccentPicker);
    return { tree, picker };
  }

  it("saves a colour once it's chosen, says Saved, and stays open", async () => {
    const save = vi.fn(() => Promise.resolve({}));
    const { tree, picker } = open(save);
    expect(tree.root.findAllByType(SheetPrimaryButton)).toHaveLength(0);
    // A keystroke's colour isn't a choice yet.
    act(() => picker().props.onChange("#2563EB"));
    expect(save).not.toHaveBeenCalled();
    await act(async () => picker().props.onCommit("#2563EB"));
    expect(save).toHaveBeenCalledWith({ accent_color: "#2563EB" });
    expect(screenText(tree)).toContain("Saved");
    expect(dismiss).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("sends nothing for the colour the chapter already has", async () => {
    const save = vi.fn(() => Promise.resolve({}));
    const { tree, picker } = open(save);
    await act(async () => picker().props.onCommit("#4f2683"));
    expect(save).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("says why a save didn't land", async () => {
    const { tree, picker } = open(() => Promise.reject(new Error("offline")));
    await act(async () => picker().props.onCommit("#2563EB"));
    const text = screenText(tree);
    expect(text).not.toContain("Saved");
    expect(text).toMatch(/offline|Couldn't save the accent/);
    act(() => tree.unmount());
  });
});
