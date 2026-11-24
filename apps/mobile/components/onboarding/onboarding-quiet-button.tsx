import { StyleSheet, Text } from "react-native";
import { SignetTokens } from "@repo/theme/signet";
import { typeRole, useFrappTheme } from "@/lib/theme";
import { OnboardingPressable } from "./onboarding-pressable";

/**
 * The quiet answer under an onboarding step's gold button: Not now on the
 * notifications and Meet Frapp AI steps, Skip for now on s03's About you
 * (#5284). Muted and underlined, as web's `QUIET_LINK`, at the 44pt touch
 * floor. One component for every onboarding quiet answer (s03, Meet Frapp AI,
 * chapter setup's invite step), since the copies it replaced had drifted (one
 * underlined, two not).
 *
 * A quiet line takes no dim of its own when disabled (`OnboardingPressable`);
 * `held` dims it, for a step held by something else, such as a sign-out.
 */
export function OnboardingQuietButton({
  label,
  onPress,
  disabled = false,
  held = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  held?: boolean;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  return (
    <OnboardingPressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      quiet
      style={[styles.button, held ? styles.held : null]}
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
    held: {
      opacity: 0.5,
    },
    label: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.mutedForeground,
      textDecorationLine: "underline",
    },
  });
}
