import { StyleSheet } from "react-native";
import type { SignetTokens } from "@repo/theme/signet";
import { fontFamilyFor, typeRole } from "@/lib/theme";

/**
 * Search's rows and headings, shared by the screen and its Jump to a channel
 * list (#6053), so both draw one row.
 */
export function createSearchStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    headingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    heading: {
      ...typeRole(tokens.typography.role.caption),
      fontFamily: fontFamilyFor(600),
      color: tokens.color.text.mutedForeground,
      paddingTop: tokens.spacing.lg,
      paddingBottom: tokens.spacing.xs,
    },
    clear: {
      ...typeRole(tokens.typography.role.caption),
      fontFamily: fontFamilyFor(600),
      paddingTop: tokens.spacing.lg,
      paddingBottom: tokens.spacing.xs,
    },
    status: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.mutedForeground,
      paddingTop: tokens.spacing.md,
    },
    row: {
      minHeight: tokens.touch.minimum,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
    },
    askRow: {
      marginTop: tokens.spacing.lg,
      paddingHorizontal: tokens.spacing.md,
      borderWidth: 1,
      borderRadius: tokens.radius.card,
    },
    label: {
      flexShrink: 1,
      flexGrow: 1,
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.foreground,
    },
    // An unread channel's name, bold as its row on Chat home (foundations §5).
    labelUnread: {
      ...typeRole({
        ...tokens.typography.role.body,
        weight: tokens.typography.weight.bold,
      }),
    },
    hint: {
      flexShrink: 0,
      maxWidth: "45%",
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
  });
}
