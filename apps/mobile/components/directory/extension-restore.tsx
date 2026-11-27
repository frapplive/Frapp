import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  useBlockedFromExtensions,
  usePermissionList,
  useRestoreTaskExtensions,
} from "@repo/hooks";
import { errorCopy } from "@repo/hooks/error-copy";
import { can, TASK_EXTENSION_COPY } from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { pageSurfaces } from "@/lib/surfaces";
import { typeRole, useFrappTheme } from "@/lib/theme";

/**
 * A member who used 3 extensions in 30 days, to a `tasks:manage` holder on
 * their profile (#6096, `spec/behavior/tasks.md` § Asking for more time):
 * "Can't ask for more time (…)" and **Restore extension requests**, a
 * compact button sized to its label, as the profile's Message is. Once it
 * lands it says "Extension requests restored" where the button was. Nothing
 * for anyone else, or for a member who can still ask.
 */
export function ExtensionRestore({ userId }: { userId: string }) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const canManageTasks = can("tasks:manage", usePermissionList());
  const blocked = useBlockedFromExtensions({ enabled: canManageTasks });
  const restore = useRestoreTaskExtensions();
  const [restored, setRestored] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const isBlocked =
    canManageTasks &&
    (blocked.data ?? []).some((entry) => entry.user_id === userId);

  if (restored) {
    return (
      <Text style={styles.done} accessibilityLiveRegion="polite">
        {TASK_EXTENSION_COPY.restored}
      </Text>
    );
  }
  if (!isBlocked) return null;

  const busy = restore.isPending;
  return (
    <View style={styles.block}>
      <Text style={styles.badge}>{TASK_EXTENSION_COPY.blockedBadge}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={TASK_EXTENSION_COPY.restore}
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        hitSlop={6}
        onPress={() => {
          setFailure(null);
          restore.mutate(userId, {
            onSuccess: () => setRestored(true),
            onError: (error) =>
              setFailure(
                errorCopy(error, TASK_EXTENSION_COPY.restoreFailed, {
                  serverWritesForMembers: true,
                }),
              ),
          });
        }}
        style={({ pressed }) => [
          styles.button,
          pressed ? styles.buttonPressed : null,
        ]}
      >
        {busy ? (
          <ActivityIndicator
            size="small"
            color={tokens.color.text.mutedForeground}
          />
        ) : null}
        <Text style={styles.buttonText}>{TASK_EXTENSION_COPY.restore}</Text>
      </Pressable>
      {failure ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {failure}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    block: {
      gap: tokens.spacing.xs,
      alignItems: "flex-start",
    },
    // In the timeout line's tone: a restriction an officer can lift.
    badge: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.warning,
    },
    // The profile's Message button's recipe: outlined, sized to its label.
    button: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xs,
      minHeight: 36,
      paddingHorizontal: tokens.spacing.md,
      borderRadius: tokens.radius.card,
      borderWidth: 1,
      borderColor: tokens.color.border.control,
      backgroundColor: pageSurfaces(tokens).card,
    },
    buttonPressed: {
      backgroundColor: pageSurfaces(tokens).raised,
    },
    buttonText: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.foreground,
    },
    done: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.success,
    },
    error: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructiveText,
    },
  });
}
