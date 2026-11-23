import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { forwardRef, useCallback } from "react";
import { TextInput, type TextInputProps, type View } from "react-native";
import { useKeepAboveKeyboard } from "@/lib/keep-above-keyboard";
import { useInSheet } from "@/lib/surfaces";

/**
 * A form's text field wherever the form is drawn. Inside a bottom sheet it is
 * the library's `BottomSheetTextInput`, which tells the sheet about the
 * keyboard; anywhere else a plain `TextInput`, since the library's field
 * throws outside a sheet. The event form is drawn both ways: as its own
 * sheet, and in place on an Ask card, whose host is the Ask sheet or a
 * channel (2026-11-23, Paul's "Card expands in place").
 *
 * It also keeps itself above the keyboard inside a scroll view that offers a
 * reveal (`useKeepAboveKeyboard`), as the Ask sheet's thread does; outside
 * one that does nothing.
 */
export const FormTextInput = forwardRef<TextInput, TextInputProps>(
  function FormTextInput(
    { onLayout, onFocus, onBlur, onChangeText, ...props },
    ref,
  ) {
    const inSheet = useInSheet();
    const { hold, ...keep } = useKeepAboveKeyboard();
    const attach = useCallback(
      (node: TextInput | null | undefined) => {
        const held = node ?? null;
        hold(held as unknown as View | null);
        if (typeof ref === "function") ref(held);
        else if (ref) ref.current = held;
      },
      [hold, ref],
    );
    const Input = inSheet ? BottomSheetTextInput : TextInput;
    return (
      <Input
        {...props}
        ref={attach}
        onLayout={(event) => {
          keep.onLayout();
          onLayout?.(event);
        }}
        onFocus={(event) => {
          keep.onFocus();
          onFocus?.(event);
        }}
        onBlur={(event) => {
          keep.onBlur();
          onBlur?.(event);
        }}
        onChangeText={(text) => {
          keep.onType();
          onChangeText?.(text);
        }}
      />
    );
  },
);
