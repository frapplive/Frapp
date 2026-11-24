import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useChapterRoleColors, useViewerDisplayName } from "@repo/hooks";
import { roleColorLabel } from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { ListRow } from "@/components/list-section";
import { RoleColorSheet } from "@/components/roles/role-color-sheet";
import { useFrappTheme } from "@/lib/theme";

/**
 * A "Color" row that opens {@link RoleColorSheet} (#5966): its value is the
 * color's name with its dot, as web's role page shows the picker beside the
 * name. `onChange` saves (a role's or group's screen) or keeps a draft (New
 * role); a failure line from the host shows under the label.
 */
export function RoleColorRow({
  value,
  name,
  onChange,
  disabled,
  failure,
  label = "Color",
}: {
  value: string | null;
  /** The role's or group's name, for the sheet's preview. */
  name: string;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  failure?: string | null;
  label?: string;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const sheetRef = useRef<BottomSheetModal>(null);
  const chapterColors = useChapterRoleColors();
  const memberName = useViewerDisplayName();
  return (
    <>
      <ListRow
        label={label}
        value={roleColorLabel(value)}
        leading={
          <View
            style={[
              styles.dot,
              value ? { backgroundColor: value } : styles.dotNone,
            ]}
          />
        }
        description={failure ?? undefined}
        descriptionTone={failure ? "destructive" : "default"}
        disabled={disabled}
        onPress={disabled ? undefined : () => sheetRef.current?.present()}
        accessibilityHint="Opens the colors."
      />
      <RoleColorSheet
        ref={sheetRef}
        value={value}
        onChange={onChange}
        previewName={name}
        memberName={memberName}
        chapterColors={chapterColors}
        title={label}
      />
    </>
  );
}

/** The paintable color a saved value shows while its save is in flight. */
export function useOptimisticColor(stored: string | null, updatedAt: number) {
  const [wanted, setWanted] = useState<{ color: string | null } | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  if (
    wanted &&
    savedAt !== null &&
    (updatedAt > savedAt || wanted.color === stored)
  ) {
    setWanted(null);
    setSavedAt(null);
  }
  return {
    value: wanted ? wanted.color : stored,
    start: (color: string | null) => {
      setWanted({ color });
      setSavedAt(null);
    },
    saved: () => setSavedAt(Date.now()),
    failed: () => {
      setWanted(null);
      setSavedAt(null);
    },
  };
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
