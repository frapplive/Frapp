import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, type ComponentProps } from "react";
import { TextInput, type TextInputProps, type View } from "react-native";
import { useKeepAboveKeyboard } from "@/lib/keep-above-keyboard";
import { useInSheet } from "@/lib/surfaces";

type BottomSheetInputRef = ComponentProps<typeof BottomSheetTextInput>["ref"];

/**
 * A text field wherever it is drawn: inside a bottom sheet, the library's
 * `BottomSheetTextInput`, which tells the sheet about the keyboard; anywhere
 * else a plain `TextInput`, since the library's field throws outside a
 * sheet. The event form is drawn both ways: as its own sheet, and in place
 * on an Ask card in the Ask sheet (Paul picked "Card expands in place",
 * 2026-11-22). The Ask card's own fields are drawn in the Ask sheet and in
 * a channel.
 *
 * For a part that keeps its field above the keyboard itself (the event
 * form's agenda, `useKeepAboveKeyboard` on its section); every other field
 * takes {@link FormTextInput}.
 */
export const SheetAwareTextInput = forwardRef<TextInput, TextInputProps>(
  function SheetAwareTextInput(props, ref) {
    // The library's field types its ref as gesture-handler's input; both
    // hand back the same native text input.
    if (useInSheet()) {
      return (
        <BottomSheetTextInput
          {...props}
          ref={ref as unknown as BottomSheetInputRef}
        />
      );
    }
    return <TextInput {...props} ref={ref} />;
  },
);

/**
 * {@link SheetAwareTextInput} that also keeps itself above the keyboard
 * inside a scroll view that offers a reveal (`useKeepAboveKeyboard`), as the
 * Ask sheet's thread does; outside one that does nothing.
 */
export const FormTextInput = forwardRef<TextInput, TextInputProps>(
  function FormTextInput(
    { onLayout, onFocus, onBlur, onChangeText, ...props },
    ref,
  ) {
    const { hold, ...keep } = useKeepAboveKeyboard();
    const attach = useCallback(
      (node: TextInput | null) => {
        hold(node as unknown as View | null);
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [hold, ref],
    );
    return (
      <SheetAwareTextInput
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
