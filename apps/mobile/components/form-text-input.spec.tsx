import React, { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { useBottomSheetInternal } from "@gorhom/bottom-sheet";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormTextInput, SheetAwareTextInput } from "./form-text-input";

function drawn(element: React.ReactElement): string[] {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  const types = tree.root
    .findAll((node) => typeof node.type === "string")
    .map((node) => node.type as string);
  act(() => tree.unmount());
  return types;
}

describe("a form field drawn in or out of a sheet (2026-11-22)", () => {
  afterEach(() => {
    vi.mocked(useBottomSheetInternal).mockReturnValue(null);
  });

  it("is a plain field outside a sheet, where the library's field throws", () => {
    expect(drawn(<FormTextInput accessibilityLabel="Name" />)).toContain(
      "TextInput",
    );
    expect(drawn(<SheetAwareTextInput />)).not.toContain(
      "BottomSheetTextInput",
    );
  });

  it("is the library's field inside a sheet, so the sheet hears the keyboard", () => {
    vi.mocked(useBottomSheetInternal).mockReturnValue({} as never);
    expect(drawn(<FormTextInput accessibilityLabel="Name" />)).toContain(
      "BottomSheetTextInput",
    );
    expect(drawn(<SheetAwareTextInput />)).toContain("BottomSheetTextInput");
  });
});
