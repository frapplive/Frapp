import { folderCardText } from "@repo/hooks/document-folder-tree";
import { StyleSheet, Text, View } from "react-native";
import { NAV_GLYPHS } from "@repo/theme/nav-glyphs";
import { SignetTokens } from "@repo/theme/signet";
import { formatDay } from "@repo/formatting";
import { isDriveCopy, type MarkedItem } from "@repo/hooks/document-library";
import { typeRole, useFrappTheme } from "@/lib/theme";
import { pageSurfaces } from "@/lib/surfaces";
import { useChapterBranding } from "@/lib/chapter-branding";
import { NavGlyph } from "@/components/nav-glyph";
import { PressableRow, SectionHeader } from "@/components/list-section";
import {
  MINUTES_SPOKEN_KIND,
  documentOpenHint,
  minutesMeta,
  type DocumentFolder,
  type MobileDocument,
} from "@/lib/more/documents";
import { DriveGlyph, StarGlyph } from "./document-glyphs";
import { LIMITED_LABEL, LimitedMark } from "./limited-mark";

/** A pinned or starred thing on s12: a folder, or a single file (#3934). */
export type MarkedCardItem = MarkedItem<DocumentFolder, MobileDocument>;

/**
 * s12's PINNED section (`canvas-screens.dc.html` s12), and a STARRED one under
 * it (#3934, `spec/behavior/chapter-docs.md` § Pinned and starred): cards
 * above the list on All with no search or filter, folders and files together.
 * The board draws each card as a filled, bordered tile with the accent
 * duotone file glyph, a title and a meta line; a starred card takes the
 * neutral glyph, so the two groups read apart before their labels are read.
 * A tap opens the folder or the file; a long press opens the same Star and
 * Pin sheet a row's does.
 */
export function MarkedCards({
  pinned,
  starred,
  isStarred,
  isLimited,
  openingId,
  deletingIds,
  actionsLabel,
  onOpenFolder,
  onOpenDocument,
  onActions,
  folderNames,
}: {
  pinned: readonly MarkedCardItem[];
  starred: readonly MarkedCardItem[];
  isStarred: (item: MarkedCardItem) => boolean;
  /** Whether not everyone can see the card's folder or file: a lock (#5216). */
  isLimited: (item: MarkedCardItem) => boolean;
  /** The file whose link is being fetched, which shows its spinner. */
  openingId: string | null;
  /** Files being deleted: their cards take no press, as their rows don't. */
  deletingIds: ReadonlySet<string>;
  /** Each card's long press, spoken: what the viewer may do to that item (#5563). */
  actionsLabel: (item: MarkedCardItem) => string;
  onOpenFolder: (name: string) => void;
  onOpenDocument: (doc: MobileDocument) => void;
  onActions: (item: MarkedCardItem) => void;
  /** Every folder the member has, so a deep folder's card reads its own name (#5337). */
  folderNames: ReadonlySet<string>;
}) {
  if (pinned.length === 0 && starred.length === 0) return null;
  return (
    <>
      {pinned.length > 0 ? (
        <>
          <SectionHeader>Pinned</SectionHeader>
          <CardList
            items={pinned}
            accented
            isStarred={isStarred}
            isLimited={isLimited}
            openingId={openingId}
            deletingIds={deletingIds}
            actionsLabel={actionsLabel}
            onOpenFolder={onOpenFolder}
            onOpenDocument={onOpenDocument}
            onActions={onActions}
            folderNames={folderNames}
          />
        </>
      ) : null}
      {starred.length > 0 ? (
        <>
          <SectionHeader>Starred</SectionHeader>
          <CardList
            items={starred}
            accented={false}
            isStarred={isStarred}
            isLimited={isLimited}
            openingId={openingId}
            deletingIds={deletingIds}
            actionsLabel={actionsLabel}
            onOpenFolder={onOpenFolder}
            onOpenDocument={onOpenDocument}
            onActions={onActions}
            folderNames={folderNames}
          />
        </>
      ) : null}
    </>
  );
}

function CardList({
  items,
  accented,
  isStarred,
  isLimited,
  openingId,
  deletingIds,
  actionsLabel,
  onOpenFolder,
  onOpenDocument,
  onActions,
  folderNames,
}: {
  items: readonly MarkedCardItem[];
  accented: boolean;
  isStarred: (item: MarkedCardItem) => boolean;
  isLimited: (item: MarkedCardItem) => boolean;
  openingId: string | null;
  deletingIds: ReadonlySet<string>;
  actionsLabel: (item: MarkedCardItem) => string;
  onOpenFolder: (name: string) => void;
  onOpenDocument: (doc: MobileDocument) => void;
  onActions: (item: MarkedCardItem) => void;
  folderNames: ReadonlySet<string>;
}) {
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = createStyles(tokens);
  const muted = tokens.color.text.muted;
  return (
    <View style={styles.list}>
      {items.map((item) => {
        const key =
          item.kind === "folder" ? `f:${item.folder.id}` : `d:${item.doc.id}`;
        /*
          A folder card reads the folder's own name and says where it sits,
          as web's cards and the folder chips do (#5337): a synced folder's
          whole path would truncate before its own name.
        */
        const card =
          item.kind === "folder"
            ? folderCardText(item.folder.name, item.count, folderNames)
            : null;
        const title = card
          ? card.title
          : item.kind === "document"
            ? item.doc.title
            : "";
        // A meeting's posted minutes (#5949): the minutes glyph, their own
        // line (the day they met, where they are filed, what they hold), and
        // a tap that opens them.
        const minutes = item.kind === "document" ? item.doc.minutes : null;
        const meta =
          item.kind === "folder"
            ? (card?.meta ?? "")
            : minutes
              ? (minutesMeta(item.doc, minutes) ?? "")
              : [
                  item.doc.document_type,
                  formatDay(item.doc.created_at || null)
                    ? `Uploaded ${formatDay(item.doc.created_at || null)}`
                    : null,
                  item.doc.folder,
                ]
                  .filter(Boolean)
                  .join(" · ");
        const starred = isStarred(item);
        const limited = isLimited(item);
        // A file on its way out takes no second press or long press, as its
        // row doesn't (`ListRow` while busy): a second Delete would fail.
        const deleting =
          item.kind === "document" && deletingIds.has(item.doc.id);
        const busy =
          deleting || (item.kind === "document" && item.doc.id === openingId);
        return (
          <PressableRow
            key={key}
            onCard
            accessibilityRole="button"
            accessibilityLabel={
              card?.where ? `${title}, in ${card.where}` : title
            }
            accessibilityValue={
              minutes || limited
                ? {
                    text: [
                      minutes ? MINUTES_SPOKEN_KIND : null,
                      limited ? LIMITED_LABEL : null,
                    ]
                      .filter(Boolean)
                      .join(", "),
                  }
                : undefined
            }
            accessibilityHint={
              item.kind === "folder"
                ? "Shows this folder's files."
                : documentOpenHint(item.doc)
            }
            accessibilityState={busy ? { busy: true } : undefined}
            accessibilityActions={
              deleting
                ? undefined
                : [{ name: "longpress", label: actionsLabel(item) }]
            }
            onAccessibilityAction={(event) => {
              if (!deleting && event.nativeEvent.actionName === "longpress") {
                onActions(item);
              }
            }}
            disabled={deleting}
            onPress={() =>
              item.kind === "folder"
                ? onOpenFolder(item.folder.name)
                : onOpenDocument(item.doc)
            }
            onLongPress={deleting ? undefined : () => onActions(item)}
            style={styles.card}
          >
            <NavGlyph
              paths={
                item.kind === "folder"
                  ? NAV_GLYPHS.folder
                  : minutes
                    ? NAV_GLYPHS.meetings
                    : NAV_GLYPHS.documents
              }
              color={accented ? accent : muted}
              size={22}
              active={accented}
            />
            <View style={styles.text}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {meta ? (
                <Text style={styles.meta} numberOfLines={1}>
                  {meta}
                </Text>
              ) : null}
            </View>
            {limited ? (
              <LimitedMark
                color={tokens.color.text.mutedForeground}
                size={16}
              />
            ) : null}
            {/* Drive's mark, as the file's row wears it (#6055). */}
            {item.kind === "document" && isDriveCopy(item.doc) ? (
              <DriveGlyph size={16} />
            ) : null}
            {starred ? <StarGlyph color={accent} on size={16} /> : null}
          </PressableRow>
        );
      })}
    </View>
  );
}

function createStyles(tokens: SignetTokens) {
  const surfaces = pageSurfaces(tokens);
  return StyleSheet.create({
    list: {
      gap: tokens.spacing.sm,
    },
    // The board's card: a screen's card fill (`lib/surfaces.ts`) at radius 14
    // with a hairline, as `ListSection` draws its grouped list, one card per
    // item.
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
      minHeight: tokens.touch.minimum,
      paddingHorizontal: tokens.spacing.lg,
      paddingVertical: tokens.spacing.md,
      borderRadius: tokens.radius.card,
      borderWidth: 1,
      borderColor: tokens.color.border.hairline,
      backgroundColor: surfaces.card,
    },
    text: {
      flex: 1,
      gap: 0,
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
