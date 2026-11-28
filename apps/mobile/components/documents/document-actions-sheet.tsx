import { forwardRef, useCallback, useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { SignetTokens } from "@repo/theme/signet";
import { typeRole, useFrappTheme } from "@/lib/theme";
import { useChapterBranding } from "@/lib/chapter-branding";
import {
  SheetBackToClose,
  SheetGrabber,
  SheetScrim,
  SHEET_STACK_BEHAVIOR,
  useSheetBackgroundStyle,
  useSheetClose,
} from "@/components/sheet-scaffold";
import { PencilGlyph, UploadGlyph } from "@/components/control-glyphs";
import { FolderGlyph } from "@/components/settings-glyphs";
import {
  MOVE_DOCUMENT_TITLE,
  RENAME_IN_DRIVE_LABEL,
} from "@repo/hooks/document-library";
import { DriveGlyph, PinGlyph, StarGlyph } from "./document-glyphs";

/** The rows' leading glyph, at the composer + sheet's size. */
const GLYPH_SIZE = 20;

/** What a long press on s12 acts on: a folder chip or a file row (#3934). */
export interface DocumentActionsTarget {
  kind: "folder" | "document";
  id: string;
  /** The folder's name or the file's title, as the screen shows it. */
  name: string;
  pinned: boolean;
  starred: boolean;
  /** A copy of a file in the chapter's Google Drive folder (#5157): no Delete. */
  fromDrive?: boolean;
  /** The file's page in Google Drive (#6055): offers Open in Google Drive. */
  driveUrl?: string | null;
  /**
   * A meeting's posted minutes, filed as a document (#5949): no Delete. They
   * are deleted as minutes, from their own screen, and the API refuses a
   * delete here.
   */
  minutes?: boolean;
  /**
   * The member may upload a new version of this file (#6055,
   * `mayUploadNewVersion`): its uploader or whoever manages documents, never
   * on a Drive file or minutes.
   */
  canUploadVersion?: boolean;
  /**
   * The member may rename this file here (#5563, `mayRenameDocument`): its
   * uploader or whoever manages documents, never a file that takes its name
   * from Drive or its meeting.
   */
  canRename?: boolean;
  /** The member may move it to another folder (#5563, `mayRefileDocument`). */
  canMove?: boolean;
  /** The folder it's filed in, `null` for none: Move to folder's current pick. */
  folder?: string | null;
}

export interface DocumentActionsSheetProps {
  /** The folder or file the sheet is open on; `null` while closed. */
  target: DocumentActionsTarget | null;
  /** Holds `chapter_docs:manage`: may pin, and delete a file. */
  canManage: boolean;
  onToggleStar: (target: DocumentActionsTarget) => void;
  onTogglePin: (target: DocumentActionsTarget) => void;
  /** A file's delete, which confirms first; folders are managed on web. */
  onDelete: (target: DocumentActionsTarget) => void;
  /** Opens a Drive file's page, in the Drive app when it's installed. */
  onOpenInDrive: (url: string) => void;
  /** Opens the system picker for a new version of the file (#6055). */
  onUploadVersion?: (target: DocumentActionsTarget) => void;
  /** Opens Rename for the file (#5563). */
  onRename?: (target: DocumentActionsTarget) => void;
  /** Opens Move to folder for the file (#5563). */
  onMove?: (target: DocumentActionsTarget) => void;
}

/**
 * s12's long-press sheet (#3934, `spec/behavior/chapter-docs.md` § Pinned and
 * starred): Star for everyone, Pin for the chapter for whoever manages
 * documents, and, on a file, Delete document, which used to be the long
 * press's only action. An action menu's chrome (components.md § Chrome
 * weight): a line naming the folder or file, then bare rows at the 44pt
 * floor with no explaining lines. A row runs once the sheet has closed, so
 * Delete's system confirm never draws over the sheet.
 */
export const DocumentActionsSheet = forwardRef<
  BottomSheetModal,
  DocumentActionsSheetProps
>(function DocumentActionsSheet(
  {
    target,
    canManage,
    onToggleStar,
    onTogglePin,
    onDelete,
    onOpenInDrive,
    onUploadVersion,
    onRename,
    onMove,
  },
  ref,
) {
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = createStyles(tokens);
  const backgroundStyle = useSheetBackgroundStyle();
  const closeSheet = useSheetClose(ref);
  const chosen = useRef<(() => void) | null>(null);

  const choose = useCallback(
    (run: () => void) => {
      chosen.current = run;
      closeSheet();
    },
    [closeSheet],
  );
  const dismissed = useCallback(() => {
    const run = chosen.current;
    chosen.current = null;
    run?.();
  }, []);

  const muted = tokens.color.text.mutedForeground;

  return (
    <BottomSheetModal
      ref={ref}
      stackBehavior={SHEET_STACK_BEHAVIOR}
      enableDynamicSizing
      backgroundStyle={backgroundStyle}
      handleComponent={SheetGrabber}
      backdropComponent={SheetScrim}
      onDismiss={dismissed}
    >
      <SheetBackToClose onClose={closeSheet} />
      <BottomSheetView onAccessibilityEscape={closeSheet} style={styles.body}>
        {/* No title and no Cancel: this is a menu of actions, not a form.
            The line naming the folder or file is its heading, and the
            grabber, the scrim, Android back and VoiceOver's escape close it
            (components.md § Chrome weight), as message-actions-sheet.tsx's
            does. */}
        {target ? (
          <>
            <Text style={styles.nameLine} numberOfLines={1}>
              {target.name}
            </Text>
            <ActionRow
              label={target.starred ? "Unstar" : "Star"}
              glyph={
                <StarGlyph
                  color={target.starred ? accent : muted}
                  on={target.starred}
                  size={GLYPH_SIZE}
                />
              }
              onPress={() => choose(() => onToggleStar(target))}
              styles={styles}
            />
            {canManage ? (
              <ActionRow
                label={
                  target.pinned
                    ? "Unpin for the chapter"
                    : "Pin for the chapter"
                }
                glyph={
                  <PinGlyph
                    color={target.pinned ? accent : muted}
                    on={target.pinned}
                    size={GLYPH_SIZE}
                  />
                }
                onPress={() => choose(() => onTogglePin(target))}
                styles={styles}
              />
            ) : null}
            {/* Rename and Move to folder (#5563), as Drive's menu has them.
                A Drive file takes its name from Drive, so in Rename's place
                its sheet says where it is renamed and opens it there. */}
            {target.kind === "document" && target.canRename && onRename ? (
              <ActionRow
                label="Rename"
                glyph={<PencilGlyph color={muted} size={GLYPH_SIZE} />}
                onPress={() => choose(() => onRename(target))}
                styles={styles}
              />
            ) : target.kind === "document" && target.driveUrl ? (
              <ActionRow
                label={RENAME_IN_DRIVE_LABEL}
                glyph={<PencilGlyph color={muted} size={GLYPH_SIZE} />}
                onPress={() => {
                  const url = target.driveUrl;
                  if (url) choose(() => onOpenInDrive(url));
                }}
                styles={styles}
              />
            ) : null}
            {target.kind === "document" && target.canMove && onMove ? (
              <ActionRow
                label={MOVE_DOCUMENT_TITLE}
                glyph={<FolderGlyph color={muted} size={GLYPH_SIZE} />}
                onPress={() => choose(() => onMove(target))}
                styles={styles}
              />
            ) : null}
            {/* Where a Drive file's working copy is (#6055): an edit in
                Drive syncs back, a downloaded copy would not. */}
            {target.kind === "document" && target.driveUrl ? (
              <ActionRow
                label="Open in Google Drive"
                glyph={<DriveGlyph size={GLYPH_SIZE} />}
                onPress={() => {
                  const url = target.driveUrl;
                  if (url) choose(() => onOpenInDrive(url));
                }}
                styles={styles}
              />
            ) : null}
            {/* The way back for a file shared out and changed (#6055): the
                system picker opens once the sheet has closed, and the file
                lands on this same document, as Drive's and Dropbox's
                "Upload new version" do. */}
            {target.kind === "document" &&
            target.canUploadVersion &&
            onUploadVersion ? (
              <ActionRow
                label="Upload a new version"
                glyph={<UploadGlyph color={muted} size={GLYPH_SIZE} />}
                onPress={() => choose(() => onUploadVersion(target))}
                styles={styles}
              />
            ) : null}
            {canManage &&
            target.kind === "document" &&
            !target.fromDrive &&
            !target.minutes ? (
              <ActionRow
                label="Delete document"
                // An empty slot the glyphs' width, so the three labels align.
                glyph={<View style={styles.glyphSlot} />}
                destructive
                onPress={() => choose(() => onDelete(target))}
                styles={styles}
              />
            ) : null}
          </>
        ) : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

function ActionRow({
  label,
  glyph = null,
  destructive = false,
  onPress,
  styles,
}: {
  label: string;
  glyph?: ReactNode;
  destructive?: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
    >
      {glyph}
      <Text
        style={[styles.rowLabel, destructive ? styles.rowDestructive : null]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    body: {
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: tokens.spacing.xl,
    },
    row: {
      minHeight: tokens.touch.minimum,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
    },
    rowPressed: {
      opacity: 0.7,
    },
    glyphSlot: {
      width: GLYPH_SIZE,
    },
    rowLabel: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.foreground,
      flex: 1,
    },
    rowDestructive: {
      color: tokens.color.semantic.destructive,
    },
    // The line naming what the menu acts on, as the message menu's
    // sender-and-time line is drawn.
    nameLine: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
      paddingBottom: tokens.spacing.xs,
    },
  });
}
