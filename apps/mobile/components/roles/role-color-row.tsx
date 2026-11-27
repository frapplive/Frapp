import { useRef } from "react";
import { StyleSheet, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useChapterRoleColors, useViewerDisplayName } from "@repo/hooks";
import { roleColorLabel } from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { ListRow } from "@/components/list-section";
import { RoleColorSheet } from "@/components/roles/role-color-sheet";
import { useFrappTheme } from "@/lib/theme";

/**
 * A "Color" list row that opens {@link RoleColorSheet} (#5966): its value is
 * the color's name with its dot, as web's role page shows the picker beside
 * the name. The role and group pages hold each `onChange` in their draft,
 * saved with the page's Save as on web (#6029); a failure line from the host
 * shows under the label. New role draws its own row in its framed group
 * with the same {@link RoleColorDot} and sheet.
 */
export function RoleColorRow({
  value,
  subject,
  name,
  onChange,
  disabled,
  failure,
  label = "Color",
}: {
  value: string | null;
  /** The role's id, so the sheet starts fresh for each role. */
  subject: string;
  /** The role's name, for the sheet's preview. */
  name: string;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  failure?: string | null;
  label?: string;
}) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const chapterColors = useChapterRoleColors();
  const memberName = useViewerDisplayName();
  return (
    <>
      <ListRow
        label={label}
        value={roleColorLabel(value)}
        leading={<RoleColorDot value={value} />}
        description={failure ?? undefined}
        descriptionTone={failure ? "destructive" : "default"}
        disabled={disabled}
        onPress={disabled ? undefined : () => sheetRef.current?.present()}
        accessibilityHint="Opens the colors."
      />
      <RoleColorSheet
        ref={sheetRef}
        value={value}
        subject={subject}
        onChange={onChange}
        previewName={name}
        memberName={memberName}
        chapterColors={chapterColors}
        title={label}
      />
    </>
  );
}

/** A color's dot beside its name: filled, or a hollow ring for No color. */
export function RoleColorDot({ value }: { value: string | null }) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  return (
    <View
      style={[styles.dot, value ? { backgroundColor: value } : styles.dotNone]}
    />
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    dot: { width: 14, height: 14, borderRadius: 7 },
    dotNone: {
      borderWidth: 1.5,
      borderColor: tokens.color.text.mutedForeground,
    },
  });
}
