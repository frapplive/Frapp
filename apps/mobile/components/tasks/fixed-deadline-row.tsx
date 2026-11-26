import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { TASK_EXTENSION_COPY } from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { Toggle } from "@/components/toggle";
import { typeRole, useFrappTheme } from "@/lib/theme";

/**
 * Fixed deadline (#6096): no extensions, and urgent to whoever has it. A
 * label and the switch in a field's frame, under the due, on New task and
 * the task screen's edit, as web's task form and panel draw
 * `FixedDeadlineSwitch`. What it means is the switch's spoken hint, as web
 * keeps it in the switch's title rather than a line under it.
 */
export function FixedDeadlineRow({
  value,
  onChange,
  disabled,
  style,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled: boolean;
  /** The field frame the form draws its other controls in. */
  style?: StyleProp<ViewStyle>;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  return (
    <View style={[style, styles.row]}>
      <Text style={styles.label}>{TASK_EXTENSION_COPY.fixedDeadline}</Text>
      <Toggle
        value={value}
        onValueChange={onChange}
        accessibilityLabel={TASK_EXTENSION_COPY.fixedDeadline}
        accessibilityHint={TASK_EXTENSION_COPY.fixedDeadlineHint}
        disabled={disabled}
      />
    </View>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.md,
    },
    label: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.foreground,
      flexShrink: 1,
    },
  });
}
