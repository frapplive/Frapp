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
 * A "Color" list row that opens {@link RoleColorSheet} (#5966): its value is
 * the color's name with its dot, as web's role page shows the picker beside
 * the name. The role screen saves each `onChange`; a failure line from the
 * host shows under the label. New role draws its own row in its framed group
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

interface PendingColor {
  color: string | null;
  /** Which save this is, so an older save's outcome never touches a newer one. */
  token: number;
  /** When the save finished, or `null` while it's in flight. */
  savedAt: number | null;
}

/**
 * Colors being saved, by role or group id (#5966): each shows at once and
 * stays until a read after its save lands, or the read already holds it, so
 * the row doesn't flick back between the save and the refetch. A save that
 * fails puts the stored color back, but only if no newer save on the same
 * thing has started since, and a save on one group never touches another's.
 */
export function usePendingColors(updatedAt: number) {
  const [pending, setPending] = useState<Record<string, PendingColor>>({});
  const nextToken = useRef(0);

  const shown = (key: string, stored: string | null): string | null => {
    const entry = pending[key];
    if (!entry) return stored;
    const settled =
      entry.savedAt !== null &&
      (updatedAt > entry.savedAt || entry.color === stored);
    return settled ? stored : entry.color;
  };

  /** Runs `send`, showing `color` meanwhile; resolves to the error, or `null`. */
  const save = async (
    key: string,
    color: string | null,
    send: () => Promise<unknown>,
  ): Promise<unknown> => {
    nextToken.current += 1;
    const token = nextToken.current;
    setPending((all) => ({ ...all, [key]: { color, token, savedAt: null } }));
    const own = (all: Record<string, PendingColor>) =>
      all[key]?.token === token;
    try {
      await send();
      setPending((all) =>
        own(all)
          ? { ...all, [key]: { color, token, savedAt: Date.now() } }
          : all,
      );
      return null;
    } catch (error) {
      setPending((all) => {
        if (!own(all)) return all;
        const rest = { ...all };
        delete rest[key];
        return rest;
      });
      return error;
    }
  };

  return { shown, save };
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
