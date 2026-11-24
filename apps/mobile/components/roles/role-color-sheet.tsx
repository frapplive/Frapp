import { forwardRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { hsvToHex, type Hsv } from "@repo/color";
import {
  commitRoleColorHex,
  isRoleColorSwatch,
  parseRoleColorInput,
  pickRoleColor,
  ROLE_COLOR_HUE_STOPS,
  ROLE_COLOR_PICKER_COPY as COPY,
  ROLE_COLOR_SWATCH_COLUMNS,
  roleColorPickerStart,
  roleColorPreviewName,
  roleColorPickNote,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import {
  fieldTypeRole,
  MONO_FONT_FAMILY,
  typeRole,
  useFrappTheme,
} from "@/lib/theme";
import {
  SheetBackToClose,
  SheetGrabber,
  SheetHeader,
  SheetScrim,
  SHEET_STACK_BEHAVIOR,
  useSheetBackgroundStyle,
  useSheetClose,
} from "@/components/sheet-scaffold";
import { CheckGlyph } from "@/components/control-glyphs";
import { BottomSheetScrollView } from "@/lib/sheet-scrollables";

/**
 * The grid in two bands of five hue columns, so each swatch keeps the 44pt
 * touch size on a phone (web shows all ten columns in one band).
 */
const BANDS = [
  ROLE_COLOR_SWATCH_COLUMNS.slice(0, 5),
  ROLE_COLOR_SWATCH_COLUMNS.slice(5),
] as const;

const SQUARE_HEIGHT = 168;
const SNAP_POINTS = ["88%"];

/**
 * A role's or group's color on the phone (#5966, folding in #5791): the same
 * control as web's `RoleColorPicker`, in the same order. A live preview of a
 * role chip and a name in chat on the darkest surface; No color and Custom;
 * the thirty readable swatches by hue; the chapter's own colors; and Custom's
 * saturation and brightness square, hue bar and hex field, the anatomy
 * Discord's role color picker and iOS's own color picker share.
 *
 * A swatch is applied and the sheet closes, as `OptionSheet` does. Custom
 * shows its color as it's set and applies it once, when the sheet closes, with
 * no Save, so a session of drags is one save: a pick that wouldn't read is
 * made lighter, and red or gold moves to the nearest allowed hue, with one
 * line saying so (`pickRoleColor`). The host saves each `onChange`.
 */
export const RoleColorSheet = forwardRef<
  BottomSheetModal,
  {
    value: string | null;
    onChange: (next: string | null) => void;
    /**
     * What's being colored (a role's or group's id): a sheet that serves
     * several starts fresh for each, with Custom open only when its color is
     * custom.
     */
    subject?: string;
    /** The role's or group's name, for the preview's chip. */
    previewName: string;
    /** The viewer's own name, for the preview's line in chat. */
    memberName?: string | null;
    /** The chapter's own custom colors (`useChapterRoleColors`). */
    chapterColors?: readonly string[];
    title?: string;
  }
>(function RoleColorSheet(
  {
    value,
    onChange,
    subject = "",
    previewName,
    memberName,
    chapterColors = [],
    title = "Color",
  },
  ref,
) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const backgroundStyle = useSheetBackgroundStyle();
  const closeSheet = useSheetClose(ref);
  const isCustom = (color: string | null) =>
    color !== null && !isRoleColorSwatch(color);
  // Custom's color while it's being set; applied once, when the sheet closes.
  const [draft, setDraft] = useState<string | null>(value);
  const [dirty, setDirty] = useState(false);
  const [customOpen, setCustomOpen] = useState(isCustom(value));
  const [note, setNote] = useState<string | null>(null);
  const [seen, setSeen] = useState({ subject, value });
  if (seen.subject !== subject) {
    setSeen({ subject, value });
    setDraft(value);
    setDirty(false);
    setCustomOpen(isCustom(value));
    setNote(null);
  } else if (seen.value !== value) {
    setSeen({ subject, value });
    if (!dirty) setDraft(value);
  }

  const pickPreset = (next: string | null) => {
    setDirty(false);
    setDraft(next);
    setNote(null);
    onChange(next);
    closeSheet();
  };

  const moveCustom = (hex: string) => {
    const pick = pickRoleColor(hex);
    if (!pick) return;
    setDraft(pick.hex);
    setDirty(pick.hex !== value);
    setNote(roleColorPickNote(pick));
  };

  // What will be applied: Custom's color once it's been moved, else the saved one.
  const shown = dirty ? draft : value;
  const draftIsCustom = isCustom(shown);

  return (
    <BottomSheetModal
      ref={ref}
      stackBehavior={SHEET_STACK_BEHAVIOR}
      enableDynamicSizing={false}
      snapPoints={SNAP_POINTS}
      // The square and the hue bar take drags; the grabber still moves the sheet.
      enableContentPanningGesture={false}
      backgroundStyle={backgroundStyle}
      handleComponent={SheetGrabber}
      backdropComponent={SheetScrim}
      onDismiss={() => {
        // One save for the whole Custom session, however many drags it took.
        const applied = dirty && draft !== value ? draft : value;
        if (applied !== value) onChange(applied);
        setDirty(false);
        setNote(null);
        setCustomOpen(isCustom(applied));
      }}
    >
      <SheetBackToClose onClose={closeSheet} />
      <BottomSheetScrollView
        onAccessibilityEscape={closeSheet}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <SheetHeader title={title} />
        <Preview
          value={shown}
          previewName={previewName}
          memberName={memberName}
          styles={styles}
        />

        <View style={styles.tiles}>
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel={COPY.none}
            accessibilityState={{ checked: value === null }}
            onPress={() => pickPreset(null)}
            style={[styles.tile, value === null ? styles.tileOn : null]}
          >
            <View style={[styles.tileDot, styles.tileDotNone]} />
            <Text style={styles.tileLabel}>{COPY.none}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              draftIsCustom ? `${COPY.custom} ${shown}` : COPY.custom
            }
            accessibilityState={{
              expanded: customOpen,
              selected: draftIsCustom,
            }}
            onPress={() => setCustomOpen((open) => !open)}
            style={[styles.tile, draftIsCustom ? styles.tileOn : null]}
          >
            <View
              style={[
                styles.tileDot,
                draftIsCustom && shown
                  ? { backgroundColor: shown }
                  : styles.tileDotRainbow,
              ]}
            />
            <Text style={styles.tileLabel}>{COPY.custom}</Text>
          </Pressable>
        </View>

        {customOpen ? (
          <CustomColor
            key={subject}
            value={draft}
            onMove={moveCustom}
            note={note}
            tokens={tokens}
            styles={styles}
          />
        ) : null}

        <View accessibilityRole="radiogroup" style={styles.grid}>
          {BANDS.map((band, index) => (
            <View key={index} style={styles.band}>
              {band.map((column) => (
                <View key={column.key} style={styles.column}>
                  {column.swatches.map((swatch) => (
                    <Swatch
                      key={swatch.hex}
                      hex={swatch.hex}
                      label={swatch.label}
                      on={value === swatch.hex}
                      onPress={() => pickPreset(swatch.hex)}
                      tokens={tokens}
                      styles={styles}
                    />
                  ))}
                </View>
              ))}
            </View>
          ))}
        </View>

        {chapterColors.length > 0 ? (
          <View style={styles.chapterRow}>
            <Text accessibilityRole="header" style={styles.heading}>
              {COPY.inChapter}
            </Text>
            <View accessibilityRole="radiogroup" style={styles.chapterSwatches}>
              {chapterColors.map((hex) => (
                <Swatch
                  key={hex}
                  hex={hex}
                  label={`${COPY.custom} ${hex}`}
                  on={value === hex}
                  onPress={() => pickPreset(hex)}
                  tokens={tokens}
                  styles={styles}
                />
              ))}
            </View>
          </View>
        ) : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

/** A role chip on a card, and a name in chat on the background, painted in the color. */
function Preview({
  value,
  previewName,
  memberName,
  styles,
}: {
  value: string | null;
  previewName: string;
  memberName?: string | null;
  styles: ReturnType<typeof createStyles>;
}) {
  const name = roleColorPreviewName(previewName, value);
  return (
    <View accessibilityLabel={COPY.preview} style={styles.preview}>
      <View style={styles.chip}>
        <View
          style={[
            styles.chipDot,
            value ? { backgroundColor: value } : styles.chipDotNone,
          ]}
        />
        <Text numberOfLines={1} style={styles.chipLabel}>
          {name}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        style={[styles.chatName, value ? { color: value } : null]}
      >
        {memberName?.trim() || name}
      </Text>
    </View>
  );
}

function Swatch({
  hex,
  label,
  on,
  onPress,
  tokens,
  styles,
}: {
  hex: string;
  label: string;
  on: boolean;
  onPress: () => void;
  tokens: SignetTokens;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={[
        styles.swatch,
        { backgroundColor: hex },
        on ? styles.swatchOn : null,
      ]}
    >
      {on ? (
        <CheckGlyph color={tokens.color.surface.background} size={18} />
      ) : null}
    </Pressable>
  );
}

/**
 * Custom on the phone: the square and the bar follow a finger, and the hex
 * field takes its text on Done. A dragged thumb stays under the finger and a
 * typed hex moves the field and the thumbs to the color that will be saved;
 * the preview shows that readable color either way. The sheet applies it when
 * it closes.
 */
function CustomColor({
  value,
  onMove,
  note,
  tokens,
  styles,
}: {
  value: string | null;
  onMove: (hex: string) => void;
  note: string | null;
  tokens: SignetTokens;
  styles: ReturnType<typeof createStyles>;
}) {
  const [hsv, setHsv] = useState<Hsv>(() => roleColorPickerStart(value));
  const [width, setWidth] = useState(0);
  const [hexText, setHexText] = useState(value ?? "");
  const [hexError, setHexError] = useState(false);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setHexText(value ?? "");
  }

  const onLayout = (event: LayoutChangeEvent) =>
    setWidth(event.nativeEvent.layout.width);
  const clamp = (n: number) => Math.max(0, Math.min(1, n));

  const moveTo = (next: Hsv) => {
    setHsv(next);
    setHexError(false);
    onMove(hsvToHex(next));
  };

  const squareAt = (x: number, y: number): Hsv => ({
    ...hsv,
    s: clamp(x / Math.max(width, 1)),
    v: 1 - clamp(y / SQUARE_HEIGHT),
  });
  const hueAt = (x: number): Hsv => ({
    ...hsv,
    h: Math.min(clamp(x / Math.max(width, 1)) * 360, 359),
  });

  // JS-thread callbacks: the color is React state. `minDistance(0)` takes a
  // tap as well as a drag.
  const squarePan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((event) => moveTo(squareAt(event.x, event.y)))
    .onUpdate((event) => moveTo(squareAt(event.x, event.y)));
  const huePan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((event) => moveTo(hueAt(event.x)))
    .onUpdate((event) => moveTo(hueAt(event.x)));

  const step = (change: Partial<Hsv>) => moveTo({ ...hsv, ...change });
  const percent = (n: number) => Math.round(n * 100);
  const pure = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  const commitHex = () => {
    const pick = commitRoleColorHex(hexText, value);
    if (pick === null) return;
    if (pick === "invalid") {
      setHexError(true);
      return;
    }
    setHexError(false);
    // The field and the thumbs go to the color that will be saved, which the
    // note explains, even when it's the color already shown.
    setHexText(pick.hex);
    setHsv(roleColorPickerStart(pick.hex));
    // The typed color, not the adjusted one, so the note can say what changed.
    onMove(parseRoleColorInput(hexText) ?? pick.hex);
  };

  return (
    <View style={styles.custom} onLayout={onLayout}>
      <GestureDetector gesture={squarePan}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={COPY.square}
          accessibilityValue={{
            text: `Saturation ${percent(hsv.s)}%, brightness ${percent(hsv.v)}%`,
          }}
          accessibilityActions={[
            { name: "increment", label: "Brighter" },
            { name: "decrement", label: "Darker" },
          ]}
          onAccessibilityAction={(event) =>
            step({
              v: clamp(
                hsv.v +
                  (event.nativeEvent.actionName === "increment" ? 0.1 : -0.1),
              ),
            })
          }
          style={styles.square}
        >
          {width > 0 ? (
            <Svg width={width} height={SQUARE_HEIGHT}>
              <Defs>
                <LinearGradient id="sat" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#FFFFFF" />
                  <Stop offset="1" stopColor={pure} />
                </LinearGradient>
                <LinearGradient id="val" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#000000" stopOpacity="0" />
                  <Stop offset="1" stopColor="#000000" stopOpacity="1" />
                </LinearGradient>
              </Defs>
              <Rect width={width} height={SQUARE_HEIGHT} fill="url(#sat)" />
              <Rect width={width} height={SQUARE_HEIGHT} fill="url(#val)" />
            </Svg>
          ) : null}
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              {
                left: hsv.s * width - THUMB / 2,
                top: (1 - hsv.v) * SQUARE_HEIGHT - THUMB / 2,
                backgroundColor: hsvToHex(hsv),
              },
            ]}
          />
        </View>
      </GestureDetector>

      <GestureDetector gesture={huePan}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={COPY.hue}
          accessibilityValue={{ text: `${Math.round(hsv.h)} degrees` }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(event) =>
            step({
              h:
                (hsv.h +
                  (event.nativeEvent.actionName === "increment" ? 10 : -10) +
                  360) %
                360,
            })
          }
          style={styles.hueTouch}
        >
          {width > 0 ? (
            <Svg width={width} height={HUE_HEIGHT} style={styles.hueTrack}>
              <Defs>
                <LinearGradient id="hue" x1="0" y1="0" x2="1" y2="0">
                  {ROLE_COLOR_HUE_STOPS.map((h) => (
                    <Stop
                      key={h}
                      offset={String(h / 360)}
                      stopColor={hsvToHex({ h, s: 1, v: 1 })}
                    />
                  ))}
                </LinearGradient>
              </Defs>
              <Rect
                width={width}
                height={HUE_HEIGHT}
                rx={HUE_HEIGHT / 2}
                fill="url(#hue)"
              />
            </Svg>
          ) : null}
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              styles.hueThumb,
              {
                left: (hsv.h / 360) * width - THUMB / 2,
                backgroundColor: pure,
              },
            ]}
          />
        </View>
      </GestureDetector>

      <View style={styles.hexRow}>
        <Text style={styles.hexLabel}>{COPY.hex}</Text>
        <BottomSheetTextInput
          value={hexText}
          onChangeText={setHexText}
          onSubmitEditing={commitHex}
          onBlur={commitHex}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          accessibilityLabel={COPY.hex}
          placeholder="#4A90E2"
          placeholderTextColor={tokens.color.text.muted}
          style={[styles.hexField, hexError ? styles.hexFieldError : null]}
        />
      </View>
      {hexError || note ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.note, hexError ? styles.noteError : null]}
        >
          {hexError ? COPY.hexInvalid : note}
        </Text>
      ) : null}
    </View>
  );
}

const THUMB = 22;
const HUE_HEIGHT = 14;
const SWATCH = 44;

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    body: {
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: tokens.spacing.xl,
      gap: tokens.spacing.md,
    },
    preview: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
      borderRadius: tokens.radius.control,
      borderWidth: 1,
      borderColor: tokens.color.border.hairline,
      backgroundColor: tokens.color.surface.background,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xs,
      flexShrink: 1,
      borderRadius: tokens.radius.chipLarge,
      borderWidth: 1,
      borderColor: tokens.color.border.hairline,
      backgroundColor: tokens.color.surface.card,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.xs,
    },
    chipDot: { width: 8, height: 8, borderRadius: 4 },
    chipDotNone: {
      borderWidth: 1,
      borderColor: tokens.color.text.mutedForeground,
    },
    chipLabel: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.foreground,
      flexShrink: 1,
    },
    chatName: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.foreground,
      flexShrink: 1,
    },
    tiles: { flexDirection: "row", gap: tokens.spacing.sm },
    tile: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
      minHeight: tokens.touch.minimum,
      borderRadius: tokens.radius.control,
      borderWidth: 1,
      borderColor: tokens.color.border.input,
      backgroundColor: tokens.color.surface.surface1,
      paddingHorizontal: tokens.spacing.md,
    },
    tileOn: { borderColor: tokens.color.text.foreground, borderWidth: 2 },
    tileDot: { width: 18, height: 18, borderRadius: 9 },
    tileDotNone: {
      borderWidth: 1.5,
      borderColor: tokens.color.text.mutedForeground,
    },
    tileDotRainbow: {
      borderWidth: 1.5,
      borderColor: tokens.color.text.mutedForeground,
      borderStyle: "dashed",
    },
    tileLabel: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.foreground,
    },
    grid: { gap: tokens.spacing.md, alignItems: "center" },
    band: { flexDirection: "row", gap: tokens.spacing.sm },
    column: { gap: tokens.spacing.sm },
    swatch: {
      width: SWATCH,
      height: SWATCH,
      borderRadius: tokens.radius.chip,
      alignItems: "center",
      justifyContent: "center",
    },
    swatchOn: {
      borderWidth: 2,
      borderColor: tokens.color.text.foreground,
    },
    chapterRow: { gap: tokens.spacing.xs },
    heading: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.mutedForeground,
    },
    chapterSwatches: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    custom: { gap: tokens.spacing.md },
    square: {
      height: SQUARE_HEIGHT,
      borderRadius: tokens.radius.control,
      overflow: "visible",
    },
    hueTouch: {
      height: tokens.touch.minimum,
      justifyContent: "center",
    },
    hueTrack: { borderRadius: HUE_HEIGHT / 2 },
    thumb: {
      position: "absolute",
      width: THUMB,
      height: THUMB,
      borderRadius: THUMB / 2,
      borderWidth: 3,
      borderColor: "#FFFFFF",
    },
    hueThumb: { top: (tokens.touch.minimum - THUMB) / 2 },
    hexRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
    },
    hexLabel: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.mutedForeground,
    },
    hexField: {
      flex: 1,
      ...fieldTypeRole(tokens.typography.role.body),
      fontFamily: MONO_FONT_FAMILY,
      color: tokens.color.text.foreground,
      minHeight: tokens.touch.minimum,
      borderRadius: tokens.radius.control,
      borderWidth: 1,
      borderColor: tokens.color.border.input,
      backgroundColor: tokens.color.surface.surface1,
      paddingHorizontal: tokens.spacing.md,
    },
    hexFieldError: { borderColor: tokens.color.semantic.destructive },
    note: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
    },
    noteError: { color: tokens.color.semantic.destructive },
  });
}
