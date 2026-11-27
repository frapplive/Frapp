import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { NAV_GLYPHS } from "@repo/theme/nav-glyphs";
import { SignetTokens } from "@repo/theme/signet";
import {
  classifyFile,
  isDriveCopy,
  isMinutesDocument,
  type LibraryDocument,
} from "@repo/hooks/document-library";
import { typeRole, useFrappTheme } from "@/lib/theme";
import { pageSurfaces } from "@/lib/surfaces";
import { useChapterBranding } from "@/lib/chapter-branding";
import { NavGlyph } from "@/components/nav-glyph";
import { PressableRow } from "@/components/list-section";
import { GridLine, toGridChunks } from "@/components/grid-line";
import {
  MINUTES_SPOKEN_KIND,
  documentMeta,
  documentOpenHint,
  type MobileDocument,
} from "@/lib/more/documents";
import { DocumentMarks } from "./document-marks";
import { LIMITED_LABEL } from "./limited-mark";

type DocumentRowData = LibraryDocument<MobileDocument>;

/**
 * s12's Grid layout (#4175): the files two to a line, each a tile in Google
 * Drive's grid shape, a preview panel naming the file's type over its title
 * and the row's own meta line. It takes the row's tap (open), long press (the
 * Star, Pin and Delete sheet) and screen-reader wording, so the layout changes
 * the shape of the list and nothing a member can do with it.
 *
 * The preview is the type `classifyFile` gives the File type filter, not the
 * file's pages, which would mean fetching every file on screen. A pinned
 * file's glyph takes the accent duotone, as its PINNED card does; a pinned or
 * starred tile wears the marks its row wears. A meeting's posted minutes
 * (#5949) wear the minutes glyph over "Minutes", and a tap opens them.
 *
 * Lines and their padding are every grid's (`components/grid-line.tsx`), so
 * this screen and the Directory lay out alike.
 */
export function DocumentTiles({
  rows,
  isStarred,
  isLimited,
  busyIds,
  deletingIds,
  actionsLabel,
  onOpen,
  onActions,
}: {
  rows: readonly DocumentRowData[];
  isStarred: (id: string) => boolean;
  /** Whether not everyone can see the file: a lock (#5216). */
  isLimited: (doc: MobileDocument) => boolean;
  /** Files being opened or deleted: each shows a spinner and takes no press. */
  busyIds: ReadonlySet<string>;
  /** Files being deleted take no long press either, as their rows don't. */
  deletingIds: ReadonlySet<string>;
  /** The long press's spoken name, matched to what the viewer may do. */
  actionsLabel: string;
  onOpen: (doc: MobileDocument) => void;
  onActions: (doc: MobileDocument) => void;
}) {
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = createStyles(tokens);
  return (
    <View style={styles.grid}>
      {toGridChunks(rows).map((line) => (
        <GridLine key={line[0]!.doc.id} filled={line.length}>
          {line.map((row) => {
            const { doc } = row;
            const pinned = !!doc.pinned_at;
            const starred = isStarred(doc.id);
            const limited = isLimited(doc);
            const fromDrive = isDriveCopy(doc);
            const busy = busyIds.has(doc.id);
            const actionable = !busy && !deletingIds.has(doc.id);
            const meta = documentMeta(row);
            // A meeting's minutes (#5949) wear the minutes glyph and read as
            // minutes, so a tile that opens a record reads apart from one
            // that opens a file.
            const minutes = isMinutesDocument(doc);
            const marks = [
              minutes ? MINUTES_SPOKEN_KIND : null,
              limited ? LIMITED_LABEL : null,
              pinned ? "Pinned for the chapter" : null,
              starred ? "Starred" : null,
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <PressableRow
                key={doc.id}
                onCard
                accessibilityRole="button"
                accessibilityLabel={doc.title}
                accessibilityHint={[meta, documentOpenHint(doc)]
                  .filter(Boolean)
                  .join(". ")}
                accessibilityValue={marks ? { text: marks } : undefined}
                accessibilityState={{ busy }}
                accessibilityActions={
                  actionable
                    ? [{ name: "longpress", label: actionsLabel }]
                    : undefined
                }
                onAccessibilityAction={(event) => {
                  if (
                    actionable &&
                    event.nativeEvent.actionName === "longpress"
                  ) {
                    onActions(doc);
                  }
                }}
                disabled={busy}
                onPress={() => onOpen(doc)}
                onLongPress={actionable ? () => onActions(doc) : undefined}
                style={styles.tile}
              >
                <View style={styles.preview}>
                  {busy ? (
                    <ActivityIndicator
                      size="small"
                      color={tokens.color.text.muted}
                    />
                  ) : (
                    <NavGlyph
                      paths={
                        minutes ? NAV_GLYPHS.meetings : NAV_GLYPHS.documents
                      }
                      color={pinned ? accent : tokens.color.text.muted}
                      size={28}
                      active={pinned}
                    />
                  )}
                  <Text style={styles.type} numberOfLines={1}>
                    {classifyFile(doc).label}
                  </Text>
                  <DocumentMarks
                    limited={limited}
                    fromDrive={fromDrive}
                    pinned={pinned}
                    starred={starred}
                    style={styles.marks}
                  />
                </View>
                <Text style={styles.title} numberOfLines={2}>
                  {doc.title}
                </Text>
                {meta ? (
                  <Text style={styles.meta} numberOfLines={2}>
                    {meta}
                  </Text>
                ) : null}
              </PressableRow>
            );
          })}
        </GridLine>
      ))}
    </View>
  );
}

function createStyles(tokens: SignetTokens) {
  const surfaces = pageSurfaces(tokens);
  return StyleSheet.create({
    grid: {
      gap: tokens.spacing.sm,
    },
    // The PINNED card's shape (`marked-cards.tsx`): a screen's card fill
    // (`lib/surfaces.ts`), card radius, a hairline, stood on end.
    tile: {
      flex: 1,
      gap: tokens.spacing.xs,
      padding: tokens.spacing.sm,
      borderRadius: tokens.radius.card,
      borderWidth: 1,
      borderColor: tokens.color.border.hairline,
      backgroundColor: surfaces.card,
    },
    preview: {
      height: 88,
      alignItems: "center",
      justifyContent: "center",
      gap: tokens.spacing.xs,
      borderRadius: tokens.radius.control,
      backgroundColor: surfaces.raised,
      marginBottom: tokens.spacing.xs,
    },
    type: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
    },
    marks: {
      position: "absolute",
      top: tokens.spacing.xs,
      right: tokens.spacing.xs,
      flexDirection: "row",
      gap: tokens.spacing.xs,
    },
    title: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.foreground,
    },
    meta: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
    },
  });
}
