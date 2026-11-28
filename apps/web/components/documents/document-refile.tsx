"use client";

import { useId, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { useUpdateDocument } from "@repo/hooks";
import { errorCopy } from "@repo/hooks/error-copy";
import {
  MOVE_DOCUMENT_TITLE,
  NO_FOLDER_LABEL,
  RENAME_DOCUMENT_TITLE,
  mayRefileDocument,
  mayRenameDocument,
} from "@repo/hooks/document-library";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectFieldButton } from "@/components/ui/select";
import { SearchablePicker } from "@/components/shared/searchable-picker";
import type { SubscriptionGate } from "@/components/shared/subscription-gate";
import type { ChapterDocument } from "@/components/documents/document-types";
import { toast } from "@/lib/hooks/use-toast";

/**
 * What the list needs for a file's Rename and Move to folder (#5563): who may
 * do which, and what opens each question.
 */
export type DocumentRefile = {
  canRename: (doc: ChapterDocument) => boolean;
  canMove: (doc: ChapterDocument) => boolean;
  onRename: (doc: ChapterDocument) => void;
  onMove: (doc: ChapterDocument) => void;
};

type Asking = { kind: "rename" | "move"; doc: ChapterDocument } | null;

/**
 * Rename and Move to folder for one file (#5563), from its row's ⋯, as Google
 * Drive's and Dropbox's Rename and Move to are. Each is a short question, so
 * a centred dialog with the commit on the right (rulebook § 9). Who may is
 * the API's rule (`mayRefileDocument`, `mayRenameDocument`): its uploader or
 * whoever manages documents, never a copy from the Drive folder, and never a
 * rename of a file that takes its name from Drive or its meeting. A refusal
 * stays in the dialog in the server's words.
 */
export function useDocumentRefile({
  gate,
  folders,
  viewerId,
  manages,
}: {
  gate: SubscriptionGate;
  /** The chapter's folder names this member sees, in the rail's order. */
  folders: readonly string[];
  viewerId: string | null;
  /** Holds `chapter_docs:manage`. */
  manages: boolean;
}) {
  const [asking, setAsking] = useState<Asking>(null);
  const refile: DocumentRefile = {
    canRename: (doc) => mayRenameDocument(doc, viewerId, { manages }),
    canMove: (doc) => mayRefileDocument(doc, viewerId, { manages }),
    onRename: (doc) => setAsking({ kind: "rename", doc }),
    onMove: (doc) => setAsking({ kind: "move", doc }),
  };
  const close = () => setAsking(null);
  const dialogs = (
    <>
      <RenameDocumentDialog
        // A new question opens on the file's own name.
        key={asking?.kind === "rename" ? `rename:${asking.doc.id}` : "rename"}
        doc={asking?.kind === "rename" ? asking.doc : null}
        gate={gate}
        onClose={close}
      />
      <MoveDocumentDialog
        key={asking?.kind === "move" ? `move:${asking.doc.id}` : "move"}
        doc={asking?.kind === "move" ? asking.doc : null}
        folders={folders}
        gate={gate}
        onClose={close}
      />
    </>
  );
  return { refile, dialogs };
}

/** The server's refusal in a member's words, or the fallback. */
function refusal(error: unknown, fallback: string): string {
  return errorCopy(error, fallback, { serverWritesForMembers: true });
}

function RenameDocumentDialog({
  doc,
  gate,
  onClose,
}: {
  doc: ChapterDocument | null;
  gate: SubscriptionGate;
  onClose: () => void;
}) {
  const fieldId = useId();
  const update = useUpdateDocument();
  const [title, setTitle] = useState(doc?.title ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const trimmed = title.trim();
  const unchanged = !doc || trimmed === doc.title.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!doc || !trimmed || unchanged || update.isPending) return;
    setProblem(null);
    try {
      await update.mutateAsync({ id: doc.id, title: trimmed });
      onClose();
    } catch (error) {
      setProblem(refusal(error, "Couldn't rename the file. Try again."));
    }
  }

  return (
    <Dialog
      open={doc !== null}
      onOpenChange={(open) => {
        if (!open && !update.isPending) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{RENAME_DOCUMENT_TITLE}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={fieldId}>Name</Label>
            <Input
              id={fieldId}
              value={title}
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => {
                setProblem(null);
                setTitle(event.target.value);
              }}
              aria-invalid={problem ? true : undefined}
            />
            {problem ? (
              <p className="text-caption text-destructive" role="alert">
                {problem}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={update.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              {...gate.controlProps(update.isPending || !trimmed || unchanged)}
            >
              {update.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A folder choice: a name, or `null` for No folder. */
type FolderChoice = { key: string; name: string | null };

const NO_FOLDER: FolderChoice = { key: "\u0000none", name: null };

function MoveDocumentDialog({
  doc,
  folders,
  gate,
  onClose,
}: {
  doc: ChapterDocument | null;
  folders: readonly string[];
  gate: SubscriptionGate;
  onClose: () => void;
}) {
  const fieldId = useId();
  const update = useUpdateDocument();
  const current = doc?.folder ?? null;
  const [picked, setPicked] = useState<string | null>(current);
  const [problem, setProblem] = useState<string | null>(null);
  const unchanged = picked === current;
  const choices: FolderChoice[] = folders.map((name) => ({ key: name, name }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!doc || unchanged || update.isPending) return;
    setProblem(null);
    try {
      await update.mutateAsync({ id: doc.id, folder: picked });
      toast({
        title: picked
          ? `Moved to ${picked}`
          : `Moved to ${NO_FOLDER_LABEL.toLowerCase()}`,
        description: doc.title,
      });
      onClose();
    } catch (error) {
      setProblem(refusal(error, "Couldn't move the file. Try again."));
    }
  }

  return (
    <Dialog
      open={doc !== null}
      onOpenChange={(open) => {
        if (!open && !update.isPending) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{MOVE_DOCUMENT_TITLE}</DialogTitle>
            {doc ? (
              <DialogDescription className="truncate">
                {doc.title}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={fieldId}>Folder</Label>
            <SearchablePicker<FolderChoice>
              align="start"
              label="Folders"
              placeholder="Find a folder"
              items={choices}
              leadingItems={[NO_FOLDER]}
              nameOf={(choice) => choice.name ?? NO_FOLDER_LABEL}
              keyOf={(choice) => choice.key}
              defaultValue={picked ?? NO_FOLDER.key}
              emptyText="The chapter has no folders yet"
              itemClassName="text-sm"
              renderItem={(choice) => (
                <span className="truncate">
                  {choice.name ?? NO_FOLDER_LABEL}
                </span>
              )}
              onPick={(choice) => {
                setProblem(null);
                setPicked(choice.name);
              }}
              trigger={
                <SelectFieldButton id={fieldId}>
                  {picked ?? NO_FOLDER_LABEL}
                </SelectFieldButton>
              }
            />
            {problem ? (
              <p className="text-caption text-destructive" role="alert">
                {problem}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={update.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              {...gate.controlProps(update.isPending || unchanged)}
            >
              {update.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Move file
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
