import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import {
  useAddRushNote,
  useDeleteRushNote,
  useEditRushNote,
  useRushNotes,
  type RushNote,
} from "@repo/hooks";
import { formatRelativeDayTime } from "@repo/formatting";
import {
  readKeptDraft,
  useKeptDraftKeys,
  useKeptFormDraft,
} from "@repo/hooks/kept-drafts";
import { RUSH_NOTE_MAX } from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { CardButton } from "@/components/chat/chat-card";
import { OverflowGlyph } from "@/components/chat/overflow-glyph";
import { PencilGlyph, TrashGlyph } from "@/components/control-glyphs";
import { IconButton } from "@/components/icon-button";
import { InlineNote } from "@/components/inline-note";
import {
  itemMenuAccessibility,
  longPressOf,
  useItemMenu,
  type ItemMenu,
} from "@/components/item-actions-menu";
import {
  ListSection,
  PressableRow,
  SectionHeader,
} from "@/components/list-section";
import { SkeletonRegion, SkeletonText } from "@/components/state-block";
import { alertFailure } from "@/lib/failure-alert";
import { confirmAlert } from "@/lib/minutes/meetings-on";
import { pageSurfaces } from "@/lib/surfaces";
import { typeRole, useFrappTheme } from "@/lib/theme";

/** The section's caption: notes stay inside the chapter (`rush.md` § Notes). */
export const RUSH_NOTES_HEADING = "Notes · chapter only";

/** Said to a writer who can't read, in place of the notes they can't see. */
export const RUSH_NOTES_WRITE_ONLY =
  "Only roles that can read recruitment notes see them.";

/**
 * A prospect's notes (#5924, `rush.md` § Notes): the box to write one, then
 * the notes, newest first. Reading needs `rush:read_notes` and writing
 * `rush:notes`; a writer who can't read gets the box and a line saying who
 * can, and no list. The author edits or deletes their own, from the note's
 * long press or its `⋯`, and `rush:manage` deletes anyone's. The host leaves
 * the section out for a prospect linked to the viewer's own account
 * (`rushNotesMode`).
 */
export function RushNotes({
  candidateId,
  viewerId,
  mode,
  canManage,
}: {
  candidateId: string;
  viewerId: string | null;
  mode: { read: boolean; write: boolean };
  canManage: boolean;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const notes = useRushNotes(candidateId, { enabled: mode.read });
  const add = useAddRushNote();
  const edit = useEditRushNote();
  const remove = useDeleteRushNote();
  const menu = useItemMenu();
  // A new note's words are kept when the member leaves (Back, a swipe) and
  // come back with them, per prospect, as every form's are (rulebook § 4:
  // never "are you sure", keep the draft). An edit of a note already posted
  // keeps nothing: the note itself is still there.
  const keys = useKeptDraftKeys();
  const draftForm = `rush-note:${candidateId}`;
  const [opening] = useState(() =>
    readKeptDraft<string>(keys.draft(draftForm)),
  );
  const [draft, setDraft] = useState(opening ?? "");
  // The note being edited in the box, or null for a new one.
  const [editing, setEditing] = useState<RushNote | null>(null);
  const kept = useKeptFormDraft(editing ? null : draftForm, true, draft, {
    restoredAtMount: opening !== undefined,
  });
  /** Back to a new note, on what was being written before the edit. */
  const leaveEdit = () => {
    setEditing(null);
    setDraft(readKeptDraft<string>(keys.draft(draftForm)) ?? "");
  };

  const body = draft.trim();
  const saving = add.isPending || edit.isPending;

  const submit = () => {
    if (!body || saving) return;
    if (editing) {
      edit.mutate(
        { candidateId, noteId: editing.id, body },
        {
          onSuccess: leaveEdit,
          onError: (error) =>
            alertFailure({ title: "Couldn't save that note", error }),
        },
      );
      return;
    }
    kept.hold();
    add.mutate(
      { candidateId, body },
      {
        onSuccess: () => {
          kept.drop();
          setDraft("");
        },
        onError: (error) => {
          kept.release();
          alertFailure({ title: "Couldn't add that note", error });
        },
      },
    );
  };

  const deleteNote = async (note: RushNote) => {
    const yes = await confirmAlert({
      title: "Delete this note?",
      body: "It's removed for everyone in the chapter.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!yes) return;
    remove.mutate(
      { candidateId, noteId: note.id },
      {
        onSuccess: () => {
          if (editing?.id === note.id) leaveEdit();
        },
        onError: (error) =>
          alertFailure({ title: "Couldn't delete that note", error }),
      },
    );
  };

  const menuFor = (note: RushNote): ItemMenu | null => {
    const own = viewerId !== null && note.author_id === viewerId;
    const actions: ItemMenu["actions"] = [];
    if (own && mode.write) {
      actions.push({
        key: "edit",
        label: "Edit note",
        glyph: (color) => <PencilGlyph color={color} />,
        run: () => {
          setEditing(note);
          setDraft(note.body);
        },
      });
    }
    if (own || canManage) {
      actions.push({
        key: "delete",
        label: "Delete note",
        destructive: true,
        glyph: (color) => <TrashGlyph color={color} />,
        run: () => void deleteNote(note),
      });
    }
    return actions.length > 0 ? { title: note.author_name, actions } : null;
  };

  return (
    <>
      <SectionHeader>{RUSH_NOTES_HEADING}</SectionHeader>
      {mode.write ? (
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={editing ? "Edit your note" : "Write a note"}
            placeholderTextColor={tokens.color.text.muted}
            accessibilityLabel={editing ? "Edit your note" : "Write a note"}
            multiline
            maxLength={RUSH_NOTE_MAX}
            editable={!saving}
            style={styles.field}
          />
          <View style={styles.composerActions}>
            {editing ? (
              <CardButton label="Cancel" variant="link" onPress={leaveEdit} />
            ) : null}
            <CardButton
              label={editing ? "Save" : "Add note"}
              variant="primary"
              disabled={!body || saving}
              onPress={submit}
            />
          </View>
        </View>
      ) : null}
      {mode.read ? (
        <NotesList
          notes={notes}
          menuFor={(note) => menu.handleFor(menuFor(note))}
        />
      ) : (
        <InlineNote>{RUSH_NOTES_WRITE_ONLY}</InlineNote>
      )}
      {menu.element}
    </>
  );
}

function NotesList({
  notes,
  menuFor,
}: {
  notes: ReturnType<typeof useRushNotes>;
  menuFor: (
    note: RushNote,
  ) => ReturnType<ReturnType<typeof useItemMenu>["handleFor"]>;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  if (notes.isPending) {
    return (
      <SkeletonRegion label="Loading notes" flush>
        <ListSection>
          {[0, 1].map((index) => (
            <View key={index} style={styles.note}>
              <SkeletonText role={tokens.typography.role.label} width="40%" />
              <SkeletonText role={tokens.typography.role.body} width="85%" />
            </View>
          ))}
        </ListSection>
      </SkeletonRegion>
    );
  }
  if (notes.isError && !notes.data) {
    return (
      <InlineNote
        tone="warning"
        action={{ label: "Try again", onPress: () => void notes.refetch() }}
      >
        {"Couldn't load notes."}
      </InlineNote>
    );
  }
  const list = notes.data ?? [];
  if (list.length === 0) return <InlineNote>No notes yet.</InlineNote>;
  return (
    <ListSection>
      {list.map((note) => (
        <NoteRow key={note.id} note={note} menu={menuFor(note)} />
      ))}
    </ListSection>
  );
}

function NoteRow({
  note,
  menu,
}: {
  note: RushNote;
  menu: ReturnType<ReturnType<typeof useItemMenu>["handleFor"]>;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const when = formatRelativeDayTime(note.created_at);
  const edited = note.updated_at !== note.created_at;
  const meta = [when, edited ? "Edited" : null].filter(Boolean).join(" · ");
  const content = (
    <>
      <View style={styles.noteHead}>
        <View style={styles.noteHeadText}>
          <Text numberOfLines={1} style={styles.author}>
            {note.author_name}
          </Text>
          {meta ? <Text style={styles.when}>{meta}</Text> : null}
        </View>
        {menu ? (
          <IconButton
            label={`More actions for ${note.author_name}'s note`}
            onPress={() => menu.open()}
          >
            <OverflowGlyph
              color={tokens.color.text.mutedForeground}
              size={20}
            />
          </IconButton>
        ) : null}
      </View>
      <Text style={styles.noteBody}>{note.body}</Text>
    </>
  );
  if (!menu) return <View style={styles.note}>{content}</View>;
  return (
    <PressableRow
      onCard
      accessibilityLabel={`${note.author_name}: ${note.body}`}
      onLongPress={longPressOf(menu)}
      {...itemMenuAccessibility(menu)}
      style={styles.note}
    >
      {content}
    </PressableRow>
  );
}

function createStyles(tokens: SignetTokens) {
  const surfaces = pageSurfaces(tokens);
  return StyleSheet.create({
    composer: {
      gap: tokens.spacing.sm,
    },
    field: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.foreground,
      backgroundColor: surfaces.card,
      borderWidth: 1,
      borderColor: tokens.color.border.hairline,
      borderRadius: tokens.radius.control,
      paddingHorizontal: tokens.spacing.md,
      paddingTop: tokens.spacing.sm,
      paddingBottom: tokens.spacing.sm,
      minHeight: tokens.touch.minimum * 2,
      textAlignVertical: "top",
    },
    composerActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      gap: tokens.spacing.md,
    },
    note: {
      paddingHorizontal: tokens.spacing.lg,
      paddingVertical: tokens.spacing.md,
      gap: tokens.spacing.xs,
    },
    noteHead: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
    noteHeadText: {
      flex: 1,
      flexDirection: "row",
      alignItems: "baseline",
      gap: tokens.spacing.sm,
    },
    author: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.foreground,
      flexShrink: 1,
    },
    when: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    noteBody: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.foreground,
    },
  });
}
