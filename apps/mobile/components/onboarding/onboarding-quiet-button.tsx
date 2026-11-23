import { StyleSheet, Text } from "react-native";
import { SignetTokens } from "@repo/theme/signet";
import { typeRole, useFrappTheme } from "@/lib/theme";
import { OnboardingPressable } from "./onboarding-pressable";

/**
 * The quiet answer under an onboarding step's gold button: Not now on the
 * notifications and Meet Frapp AI steps, Skip for now on s03's About you
 * (#5284). Muted and underlined, as web's `QUIET_LINK`, at the 44pt touch
 * floor. One component, since the two copies it replaced had already drifted
 * (one underlined, one not).
 */
export function OnboardingQuietButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  return (
    <OnboardingPressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      quiet
      style={styles.button}
    >
      <Text style={styles.label}>{label}</Text>
    </OnboardingPressable>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    button: {
      alignSelf: "center",
      minHeight: tokens.touch.minimum,
      paddingHorizontal: tokens.spacing.lg,
      justifyContent: "center",
      marginTop: tokens.spacing.xs,
    },
    label: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.mutedForeground,
      textDecorationLine: "underline",
    },
  });
}
