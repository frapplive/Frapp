"use client";

import { useId, useState } from "react";
import {
  useAddRushNote,
  useDeleteRushNote,
  useEditRushNote,
  useRushNotes,
  type RushNote,
  type RushPipelineAccess,
  type RushPipelineCandidate,
} from "@repo/hooks";
import { formatRelativeDayTime } from "@repo/formatting";
import { RUSH_NOTE_MAX } from "@repo/validation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SectionLabel } from "@/components/shared/section-label";
import { InlineNote } from "@/components/shared/inline-note";
import { NestedError } from "@/components/shared/nested-states";
import { RowMenu, type RowMenuEntry } from "@/components/shared/row-menu";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import { describeLoadFailure } from "@repo/hooks/error-copy";
import { toastFailure } from "@/lib/failure-toast";
import { OWNS_ESCAPE } from "@/components/shared/panel";

/**
 * A prospect's notes, private to the chapter: never on the chat card or in
 * a push. A role with `rush:notes` writes them; one with `rush:read_notes`
 * reads them, newest first, with who wrote each and when. An author edits or
 * deletes their own, and `rush:manage` deletes anyone's. A role that writes
 * but can't read gets the box and a line saying so, and no list.
 */
export function RushNotes({
  candidate,
  access,
  viewerId,
  writable,
}: {
  candidate: RushPipelineCandidate;
  access: RushPipelineAccess;
  viewerId: string | null;
  writable: boolean;
}) {
  const headingId = useId();
  const notes = useRushNotes(candidate.id, { enabled: access.readNotes });
  const add = useAddRushNote();
  const [draft, setDraft] = useState("");
  const body = draft.trim();

  async function submit() {
    if (!body || add.isPending) return;
    try {
      await add.mutateAsync({ candidateId: candidate.id, body });
      setDraft("");
    } catch (error) {
      toastFailure({
        title: "Couldn't add the note",
        error,
        fallback: "Retry in a moment.",
      });
    }
  }

  return (
    <section aria-labelledby={headingId} className="grid gap-3">
      <SectionLabel id={headingId}>Notes · chapter only</SectionLabel>
      {access.writeNotes ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Textarea
            aria-label={`Note on ${candidate.display_name}`}
            value={draft}
            maxLength={RUSH_NOTE_MAX}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void submit();
              }
            }}
            className="min-h-[72px] resize-y"
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={!writable || !body || add.isPending}
              title={body ? undefined : "Write a note first"}
            >
              Add note
            </Button>
          </div>
        </form>
      ) : null}
      {access.readNotes ? (
        notes.isPending ? (
          <InlineNote>Loading notes…</InlineNote>
        ) : notes.isError ? (
          <NestedError
            title="Couldn't load notes"
            description={describeLoadFailure(notes.error)}
            onRetry={() => void notes.refetch()}
          />
        ) : notes.data.length === 0 ? (
          <InlineNote>No notes yet.</InlineNote>
        ) : (
          <ul className="divide-y divide-border">
            {notes.data.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                candidateId={candidate.id}
                mine={!!viewerId && note.author_id === viewerId}
                canManage={access.manage}
                writable={writable}
              />
            ))}
          </ul>
        )
      ) : (
        <p className="text-caption text-muted-foreground">
          Your role can&apos;t read notes. The roles your chapter lets read them
          can.
        </p>
      )}
    </section>
  );
}

function NoteRow({
  note,
  candidateId,
  mine,
  canManage,
  writable,
}: {
  note: RushNote;
  candidateId: string;
  mine: boolean;
  canManage: boolean;
  writable: boolean;
}) {
  const edit = useEditRushNote();
  const remove = useDeleteRushNote();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [editing, setEditing] = useState<string | null>(null);
  const edited = note.updated_at !== note.created_at;

  async function save() {
    const body = editing?.trim();
    if (!body) return;
    if (body === note.body) {
      setEditing(null);
      return;
    }
    try {
      await edit.mutateAsync({ candidateId, noteId: note.id, body });
      setEditing(null);
    } catch (error) {
      toastFailure({
        title: "Couldn't save the note",
        error,
        fallback: "Retry in a moment.",
      });
    }
  }

  async function del() {
    const ok = await confirm({
      title: "Delete this note?",
      description: mine
        ? "It's gone for everyone who reads notes."
        : `${note.author_name}'s note is gone for everyone who reads notes.`,
      confirmLabel: "Delete note",
    });
    if (!ok) return;
    try {
      await remove.mutateAsync({ candidateId, noteId: note.id });
    } catch (error) {
      toastFailure({
        title: "Couldn't delete the note",
        error,
        fallback: "Retry in a moment.",
      });
    }
  }

  const entries: RowMenuEntry[] = [
    ...(mine
      ? [
          {
            type: "item" as const,
            key: "edit",
            label: "Edit note",
            disabled: !writable,
            onSelect: () => setEditing(note.body),
          },
        ]
      : []),
    ...(mine || canManage
      ? [
          {
            type: "item" as const,
            key: "delete",
            label: "Delete note",
            destructive: true,
            disabled: !writable,
            onSelect: () => void del(),
          },
        ]
      : []),
  ];

  const content = (
    <>
      <p className="flex flex-wrap items-baseline gap-x-2 text-caption text-muted-foreground">
        <span className="font-semibold text-foreground">
          {note.author_name}
        </span>
        <span>{formatRelativeDayTime(note.created_at)}</span>
        {edited ? <span>Edited</span> : null}
      </p>
      {editing !== null ? (
        <form
          className="grid gap-2 pt-1"
          {...{ [OWNS_ESCAPE]: "" }}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Textarea
            aria-label="Edit note"
            value={editing}
            autoFocus
            maxLength={RUSH_NOTE_MAX}
            onChange={(event) => setEditing(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setEditing(null);
              }
            }}
            className="min-h-[72px] resize-y"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!editing.trim() || edit.isPending}
            >
              Save
            </Button>
          </div>
        </form>
      ) : (
        <p className="whitespace-pre-wrap break-words pt-0.5 text-sm text-foreground">
          {note.body}
        </p>
      )}
    </>
  );

  return (
    <>
      {confirmDialog}
      {entries.length > 0 ? (
        <RowMenu
          entries={entries}
          label={`More for ${note.author_name}'s note`}
        >
          {(menuButton) => (
            <li className="group relative py-2.5 pr-10">
              {content}
              <div className="absolute right-0 top-2">{menuButton}</div>
            </li>
          )}
        </RowMenu>
      ) : (
        <li className="py-2.5">{content}</li>
      )}
    </>
  );
}
