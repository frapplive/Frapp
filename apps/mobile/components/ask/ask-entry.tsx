import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SignetTokens } from "@repo/theme/signet";
import { ASK_COPY } from "@repo/validation";
import { AskSendGlyph } from "@/components/ask/ask-send-glyph";
import { FrappCrest } from "@/components/frapp-crest";
import { useChapterBranding } from "@/lib/chapter-branding";
import { selectionHaptic } from "@/lib/haptics";
import { fontFamilyFor, tint, typeRole, useFrappTheme } from "@/lib/theme";

/** What the field opens, for a screen reader. */
export const ASK_ENTRY_HINT = "Ask a question about your chapter";

/** The field's height: the Default control step, fully round. */
const FIELD_HEIGHT = 48;

/**
 * Frapp Intelligence's front door on the phone: the top of the panel the tab
 * bar's + opens, which is New (#5983; Paul, 2026-11-24, decision 2 on #5943:
 * "New opens Frapp Intelligence, on both apps … The phone's + becomes the same
 * thing. The assistant bars on both apps go."). Web's New page leads with the
 * same field (#5946).
 *
 * Its name shows from the first frame, the crest and "Frapp Intelligence" over
 * the field, because nothing else on the way in says it (#5945's review). The
 * field is drawn as what it leads to: the placeholder the member will type
 * into, "What do you need?", and the conversation's send arrow at its end.
 * ChatGPT's and Perplexity's home screens and the Google app open their
 * assistant from a bar shaped like its field. A tap anywhere on it opens the
 * conversation (`ask-sheet.tsx`); it holds no text of its own.
 *
 * The crest, the field's edge and the arrow take the chapter's colour (Paul,
 * 2026-11-13, default 2 on #4698).
 *
 * From #4702 (2026-11-13) until #5983 it was a glass bar above the tab bar on
 * the four tabs (`ask-bar.tsx`), which folded into the tabs' row while the
 * member read down a screen (#4904).
 */
export function AskEntry({ onPress }: { onPress: () => void }) {
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      testID="ask-entry"
      accessibilityRole="button"
      // Its name is what it shows (WCAG 2.5.3): Voice Control finds it by
      // either line.
      accessibilityLabel={`${ASK_COPY.name}, ${ASK_COPY.placeholder}`}
      accessibilityHint={ASK_ENTRY_HINT}
      onPress={() => {
        selectionHaptic();
        onPress();
      }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={styles.entry}
    >
      <View style={styles.nameRow}>
        <FrappCrest height={18} color={accent} />
        <Text style={styles.name} numberOfLines={1}>
          {ASK_COPY.name}
        </Text>
      </View>
      <View
        style={[
          styles.field,
          { borderColor: tint(accent, 0.3) },
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.words} numberOfLines={1}>
          {ASK_COPY.placeholder}
        </Text>
        <View style={[styles.arrow, { backgroundColor: tint(accent) }]}>
          <AskSendGlyph color={accent} size={16} />
        </View>
      </View>
    </Pressable>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    entry: { gap: tokens.spacing.sm },
    nameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
      paddingHorizontal: tokens.spacing.xs,
    },
    name: {
      ...typeRole(tokens.typography.role.body),
      fontFamily: fontFamilyFor(600),
      color: tokens.color.text.foreground,
    },
    field: {
      minHeight: FIELD_HEIGHT,
      borderRadius: FIELD_HEIGHT / 2,
      borderWidth: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
      paddingLeft: tokens.spacing.lg,
      paddingRight: tokens.spacing.sm,
      // A step of white over the glass, as the panel's action discs.
      backgroundColor: "rgba(255,255,255,0.07)",
    },
    pressed: { backgroundColor: "rgba(255,255,255,0.14)" },
    words: {
      flex: 1,
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.mutedForeground,
    },
    arrow: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
