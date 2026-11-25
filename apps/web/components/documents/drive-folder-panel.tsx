"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  ChevronRight,
  Copy,
  ExternalLink,
  Folder,
  FolderSync,
} from "lucide-react";
import {
  useConnectGoogleDrive,
  useConnectPickedGoogleDrive,
  useGoogleDriveStatus,
  useOpenUpDriveCopy,
  type GoogleDriveStatus,
} from "@repo/hooks";
import { isEmptyChannelAccessChoice } from "@repo/hooks/channel-access";
import { codeOf } from "@repo/api-sdk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useGatedDialog,
  type SubscriptionGate,
} from "@/components/shared/subscription-gate";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import { ChannelAccessField } from "@/components/chat-admin/channel-access-field";
import {
  FOLDER_ALWAYS_LINE,
  useDocumentAccessChoices,
} from "@/components/documents/document-access";
import type {
  ChapterDocument,
  FolderRow,
} from "@/components/documents/document-types";
import { useToast } from "@/lib/hooks/use-toast";
import { getErrorMessage } from "@/lib/utils";
import {
  DrivePickerError,
  forgetDrivePickerSignIn,
  pickDriveFolder,
  preloadDrivePicker,
  type DrivePickerConfig,
  type PickedFolder,
} from "@/lib/google-drive-picker";

/**
 * Connect the chapter's Google Drive folder to Documents (#5157;
 * `spec/behavior/chapter-docs.md` § Google Drive folder). For officers with
 * Manage documents; hidden while this server has no service account, and
 * once a folder is connected: from then on the folder is managed where it
 * shows, in Documents (`drive-folder-line.tsx`, Paul's Drive-as-a-folder
 * pick, 2026-11-25).
 *
 * Picking comes first (#5583): Google's own picker opens straight from the
 * press, and only then a small dialog asks who sees the folder and, when
 * Google leaves it to the officer, has them share it with Frapp. Comparable:
 * Notion's and Slack's Google Drive connections, which open Google's picker
 * first and ask the rest after. Where this server has no picker the folder
 * is shared by hand and connected by its link.
 */
/**
 * Whether Connect Google Drive, and the Upload menu's item for the folder,
 * show: not while this server has no service account and nothing is
 * connected. One rule for both, so the item never opens nothing.
 */
export function driveFolderShown(
  data: GoogleDriveStatus | undefined,
): data is GoogleDriveStatus {
  return !!data && (data.available || !!data.connection);
}

/** The connected folder lost its sharing, so Drive needs the officer. */
export function driveNeedsAttention(
  data: GoogleDriveStatus | undefined,
): boolean {
  return data?.connection?.status === "no_access";
}

export function DriveFolderPanel({
  gate,
  openerRef,
}: {
  gate: SubscriptionGate;
  /**
   * Set, the panel draws no button of its own and puts its opener here, for
   * a menu to call: Documents opens it from the Upload menu (#5576).
   */
  openerRef?: RefObject<(() => void) | null>;
}) {
  const status = useGoogleDriveStatus();
  const dialog = useGatedDialog(gate);
  const data = status.data;
  const picker = data?.picker ?? null;
  const connected = !!data?.connection;
  // The link flow stays one press away while the picker is new (#5583): an
  // officer whose network blocks Google's scripts can still connect.
  const [byLink, setByLink] = useState(false);
  const [picked, setPicked] = useState<PickedFolder | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  // A fresh form for every pick: its share wait and Who sees it start over.
  const [pickNumber, setPickNumber] = useState(0);
  const { pick, picking } = usePickFolder(picker, !!picker && !connected);

  async function choose() {
    if (!gate.allowed) return;
    if (!picker) {
      setByLink(true);
      dialog.setOpen(true);
      return;
    }
    // Google's window opens over the page, so the dialog steps aside while
    // it is up (a modal dialog would block it).
    const before = picked ?? pickError;
    dialog.setOpen(false);
    const result = await pick();
    if (!result) {
      // Closed without a pick: back to the dialog, if it was showing one.
      if (before) dialog.setOpen(true);
      return;
    }
    setByLink(false);
    setPickNumber((n) => n + 1);
    if ("error" in result) {
      setPicked(null);
      setPickError(result.error);
    } else {
      setPicked(result.folder);
      setPickError(null);
    }
    dialog.setOpen(true);
  }
  const chooseRef = useRef(choose);
  useLayoutEffect(() => {
    chooseRef.current = choose;
    if (openerRef) openerRef.current = () => void chooseRef.current();
  });
  if (!driveFolderShown(data) || connected) return null;

  return (
    <>
      {openerRef ? null : (
        <Button
          variant="secondary"
          size="toolbar"
          className="gap-2"
          onClick={() => void choose()}
          aria-busy={picking}
          {...gate.controlProps(picking)}
        >
          <FolderSync className="h-4 w-4" />
          Connect Google Drive
        </Button>
      )}
      <Dialog {...dialog.dialogProps}>
        <DialogContent
          {...dialog.contentProps}
          aria-describedby={undefined}
          className="max-w-md"
        >
          {picker && !byLink ? (
            <PickerConnectView
              key={pickNumber}
              folder={picked}
              pickError={pickError}
              picking={picking}
              email={data.service_account_email}
              gate={gate}
              open={dialog.open}
              onChoose={() => void choose()}
              onRefused={(message) => {
                // The next pick asks Google afresh, with the account
                // chooser, from no folder.
                forgetDrivePickerSignIn();
                setPicked(null);
                setPickError(message);
              }}
              onConnected={() => {
                dialog.setOpen(false);
                setPicked(null);
              }}
              onCancel={() => dialog.setOpen(false)}
              onUseLink={() => setByLink(true)}
            />
          ) : (
            <ConnectView
              email={data.service_account_email}
              gate={gate}
              open={dialog.open}
              onCancel={() => dialog.setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConnectView({
  email,
  gate,
  open,
  onCancel,
}: {
  email: string | null;
  gate: SubscriptionGate;
  open: boolean;
  onCancel: () => void;
}) {
  const connect = useConnectGoogleDrive();
  const access = useDocumentAccessChoices(open);
  const { toast } = useToast();
  const [link, setLink] = useState("");
  const [whoCanSee, setWhoCanSee] = useState<string[] | null>(null);
  const accessId = useId();
  const hideAccess = access.optionsState === "ready" && !access.canLimit;
  const accessReady = access.optionsState === "ready";
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (
      !link.trim() ||
      connect.isPending ||
      !accessReady ||
      isEmptyChannelAccessChoice(whoCanSee)
    ) {
      return;
    }
    setError(null);
    try {
      await connect.mutateAsync({ folderLink: link.trim(), whoCanSee });
      toast({
        title: "Google Drive connected",
        description: "Its files will show up in Documents in a minute or two.",
      });
    } catch (caught) {
      // The API writes each refusal for the officer (not a folder link,
      // not shared with Frapp yet, a file instead of a folder, connected to
      // another chapter, or the code that shows the folder is this
      // chapter's, to add to its name in Drive: #5185).
      setError(
        getErrorMessage(caught, "Couldn't connect. Try again.", {
          serverWritesForMembers: true,
        }),
      );
    }
  }

  return (
    <form className="contents" onSubmit={(event) => void submit(event)}>
      <DialogHeader>
        <DialogTitle>Connect Google Drive</DialogTitle>
      </DialogHeader>
      <div className="space-y-6">
        <ol className="space-y-6">
          <li className="space-y-2">
            <p className="text-body font-medium">
              1. In Google Drive, share the folder with Frapp as a Viewer
            </p>
            {email ? <CopyAddress email={email} /> : null}
          </li>
          <li className="space-y-2">
            <Label htmlFor={inputId} className="text-body font-medium">
              2. Paste the folder&apos;s link
            </Label>
            <p className="text-caption text-muted-foreground">
              The first time, Frapp gives you a short code to add to the
              folder&apos;s name in Drive, so it knows the folder is your
              chapter&apos;s. Then connect again.
            </p>
            <Input
              id={inputId}
              value={link}
              onChange={(event) => {
                setLink(event.target.value);
                setError(null);
              }}
              placeholder="https://drive.google.com/drive/folders/…"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
            {error ? (
              <p
                id={errorId}
                role="alert"
                className="text-caption text-destructive"
              >
                {error}
              </p>
            ) : null}
          </li>
          {/*
            Left out only once the choices have loaded and say this member
            may not set a list (outside every tier); the folder then comes in
            open, as any folder they make does. While the choices load or
            fail the field shows that, and Connect waits, so a folder is never
            connected open because the picker didn't appear.
          */}
          {!hideAccess ? (
            <li className="space-y-2">
              <p className="text-body font-medium">3. Choose who sees it</p>
              <ChannelAccessField
                id={accessId}
                question="see"
                value={whoCanSee}
                onChange={setWhoCanSee}
                options={access.options}
                optionsState={access.optionsState}
                locked={access.locked}
                alwaysLine={FOLDER_ALWAYS_LINE}
                canChoose={access.canLimit}
                disabled={connect.isPending}
              />
              <p className="text-caption text-muted-foreground">
                Its subfolders start the same way. You can narrow any of them
                later from Edit folder.
              </p>
            </li>
          ) : null}
        </ol>
      </div>
      <DialogFooter className="gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            !link.trim() ||
            connect.isPending ||
            !accessReady ||
            isEmptyChannelAccessChoice(whoCanSee) ||
            !gate.allowed
          }
          aria-busy={connect.isPending}
        >
          {connect.isPending ? "Connecting…" : "Connect"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Signs the officer in with Google and opens the picker; the error, worded
 * for them, or null when they closed it (or this server has no picker).
 */
function usePickFolder(picker: DrivePickerConfig | null, active: boolean) {
  const [picking, setPicking] = useState(false);
  // Loaded as the panel opens, so the sign-in window opens straight from the
  // press: browsers block a popup opened long after it.
  useEffect(() => {
    if (active) void preloadDrivePicker().catch(() => undefined);
  }, [active]);
  async function pick(): Promise<
    { folder: PickedFolder } | { error: string } | null
  > {
    if (picking || !picker) return null;
    setPicking(true);
    try {
      const folder = await pickDriveFolder(picker);
      return folder ? { folder } : null;
    } catch (caught) {
      return {
        error:
          caught instanceof DrivePickerError
            ? caught.message
            : "Couldn't open Google's folder picker. Try again.",
      };
    } finally {
      setPicking(false);
    }
  }
  return { pick, picking };
}

/** The API's answer for a picked folder the officer must share themselves. */
const SHARE_BY_HAND = "google_drive.share_by_hand";
/** How often the panel asks again while it waits for that share. */
const SHARE_CHECK_MS = 10_000;
/**
 * How long it waits. A sign-in is only reused with more than this left
 * (`google-drive-picker.ts`), so the wait never outlives it.
 */
const SHARE_WAIT_MS = 10 * 60_000;

/** A failure a later check may not meet: the network, the server, a limit. */
function passing(caught: unknown): boolean {
  const status = (caught as { statusCode?: unknown } | null)?.statusCode;
  return typeof status !== "number" || status >= 500 || status === 429;
}

/**
 * Connect by picking (#5583): the officer signs in with Google and picks the
 * folder in Google's own picker. Frapp tries to share it with itself using
 * that sign-in, but Google lets that sign-in share only the folder, not the
 * files in it (staging, 2026-11-25), so for a folder with files the panel shows
 * Frapp's address to share it with in Drive, and connects by itself once the
 * share lands (Paul's pick, 2026-11-25). No link to paste, no code to add.
 */
function PickerConnectView({
  folder,
  pickError,
  picking,
  email,
  gate,
  open,
  onChoose,
  onRefused,
  onConnected,
  onCancel,
  onUseLink,
}: {
  /** The folder picked, or null after a refusal (pick again). */
  folder: PickedFolder | null;
  /** Why the last pick or connect failed, worded for the officer. */
  pickError: string | null;
  picking: boolean;
  email: string | null;
  gate: SubscriptionGate;
  open: boolean;
  /** Opens Google's picker again. */
  onChoose: () => void;
  onRefused: (message: string) => void;
  onConnected: () => void;
  onCancel: () => void;
  onUseLink: () => void;
}) {
  const connect = useConnectPickedGoogleDrive();
  const access = useDocumentAccessChoices(open);
  const { toast } = useToast();
  const [whoCanSee, setWhoCanSee] = useState<string[] | null>(null);
  // Shown once Google leaves the share to the officer; `waitingSince` is set
  // while the dialog checks by itself, and cleared when it stops waiting.
  const [shareStep, setShareStep] = useState(false);
  const [waitingSince, setWaitingSince] = useState<number | null>(null);
  const checking = useRef(false);
  // A pick remounts this form, so a check still running for the last folder
  // can't act on the new one.
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const accessId = useId();
  const errorId = useId();
  const hideAccess = access.optionsState === "ready" && !access.canLimit;
  const accessReady = access.optionsState === "ready";
  const blocked =
    !folder ||
    connect.isPending ||
    !accessReady ||
    isEmptyChannelAccessChoice(whoCanSee);

  /**
   * One connect attempt. `quiet` is a check while waiting for the share:
   * "not shared yet", or a failure a later check may not meet, keeps waiting.
   */
  async function attempt(picked: PickedFolder, quiet: boolean) {
    if (checking.current) return;
    checking.current = true;
    try {
      await connect.mutateAsync({
        folderId: picked.id,
        accessToken: picked.accessToken,
        whoCanSee,
      });
      if (!alive.current) return;
      toast({
        title: `${picked.name || "Google Drive"} connected`,
        description: "Its files show up in Documents in a minute or two.",
      });
      onConnected();
    } catch (caught) {
      if (!alive.current) return;
      if (codeOf(caught) === SHARE_BY_HAND) {
        // Keep the folder and the sign-in: once the officer has shared it,
        // the same request connects it.
        setShareStep(true);
        if (!quiet) setWaitingSince(Date.now());
        return;
      }
      if (quiet && passing(caught)) return;
      // The API words each refusal for the officer: a folder they can only
      // view, a school account that blocks sharing out, a folder another
      // chapter has, or a sign-in that expired (pick again).
      setShareStep(false);
      setWaitingSince(null);
      onRefused(
        getErrorMessage(caught, "Couldn't connect. Try again.", {
          serverWritesForMembers: true,
        }),
      );
    } finally {
      if (alive.current) checking.current = false;
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (blocked || !folder) return;
    await attempt(folder, false);
  }

  // While the officer shares the folder in Drive: check every few seconds,
  // and at once when they come back to this tab. A check never sends a
  // "Who sees it" choice the Connect button wouldn't.
  const waiting = waitingSince !== null && folder !== null;
  const ready = !blocked;
  const attemptRef = useRef(attempt);
  const readyRef = useRef(ready);
  useEffect(() => {
    attemptRef.current = attempt;
    readyRef.current = ready;
  });
  useEffect(() => {
    if (!waiting || !folder || waitingSince === null) return;
    const check = () => {
      if (Date.now() - waitingSince > SHARE_WAIT_MS) {
        setWaitingSince(null);
        return;
      }
      if (readyRef.current) void attemptRef.current(folder, true);
    };
    const timer = window.setInterval(check, SHARE_CHECK_MS);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [waiting, folder, waitingSince]);

  return (
    <form className="contents" onSubmit={(event) => void submit(event)}>
      <DialogHeader>
        <DialogTitle>Connect Google Drive</DialogTitle>
      </DialogHeader>
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-body font-medium">Folder</p>
          <button
            type="button"
            onClick={onChoose}
            disabled={picking || (connect.isPending && !waiting)}
            aria-busy={picking}
            aria-invalid={pickError ? true : undefined}
            aria-describedby={pickError ? errorId : undefined}
            className="flex w-full min-w-0 items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-left text-body transition-colors hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <Folder
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span
              className={
                folder
                  ? "min-w-0 flex-1 truncate"
                  : "min-w-0 flex-1 truncate text-muted-foreground"
              }
            >
              {folder
                ? folder.name || "Untitled folder"
                : "Choose a folder in Google Drive"}
            </span>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
          {pickError ? (
            <p
              id={errorId}
              role="alert"
              className="text-caption text-destructive"
            >
              {pickError}
            </p>
          ) : null}
          {shareStep && folder ? (
            <ShareByHand folderId={folder.id} email={email} waiting={waiting} />
          ) : null}
        </div>
        {/*
          Left out only once the choices have loaded and say this member may
          not set a list (outside every tier), as on the link flow.
        */}
        {!hideAccess ? (
          <div className="space-y-2">
            <p className="text-body font-medium">Who sees it</p>
            <ChannelAccessField
              id={accessId}
              question="see"
              value={whoCanSee}
              onChange={setWhoCanSee}
              options={access.options}
              optionsState={access.optionsState}
              locked={access.locked}
              alwaysLine={FOLDER_ALWAYS_LINE}
              canChoose={access.canLimit}
              disabled={connect.isPending && !waiting}
            />
          </div>
        ) : null}
        <button
          type="button"
          onClick={onUseLink}
          className="text-caption text-muted-foreground underline-offset-4 hover:underline"
        >
          Use a folder link instead
        </button>
      </div>
      <DialogFooter className="gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={blocked || waiting || !gate.allowed}
          aria-busy={connect.isPending && !waiting}
        >
          {connect.isPending && !waiting ? "Connecting…" : "Connect"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * The one step Google leaves to the officer: share the picked folder with
 * Frapp's address in Drive. While `waiting`, the panel connects by itself
 * once they have; after that, Connect checks again.
 */
function ShareByHand({
  folderId,
  email,
  waiting,
}: {
  folderId: string;
  email: string | null;
  waiting: boolean;
}) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-3">
      <p className="text-body font-medium">Share it with Frapp as a Viewer</p>
      {email ? <CopyAddress email={email} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="secondary" size="sm" className="gap-1.5">
          <a
            href={`https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Google Drive
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </Button>
        <p role="status" className="text-caption text-muted-foreground">
          {waiting ? "Waiting for the share" : "Not shared yet"}
        </p>
      </div>
    </div>
  );
}

export function CopyAddress({ email }: { email: string }) {
  const { toast } = useToast();
  async function copy() {
    try {
      // Inside the try: without a secure context `navigator.clipboard` is
      // undefined and the call throws before any promise exists.
      await navigator.clipboard.writeText(email);
      toast({ description: "Address copied." });
    } catch {
      toast({
        variant: "destructive",
        title: "Copy failed",
        description: "Select the address and copy it instead.",
      });
    }
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card-hover px-3 py-2">
      <code className="min-w-0 flex-1 select-all truncate text-caption">
        {email}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1.5"
        onClick={() => void copy()}
      >
        <Copy className="h-3.5 w-3.5" /> Copy
      </Button>
    </div>
  );
}

/** A copy sync left in place because Drive moved it somewhere wider (#5220). */
type HeldCopy = { doc: ChapterDocument; movedTo: string };

/**
 * The copies sync is holding back, each with the folder Drive put it in. A
 * copy whose folder the officer can't see comes back without one from the
 * API, so it isn't listed: it isn't theirs to open up.
 */
export function heldCopies(
  documents: readonly ChapterDocument[],
  folders: readonly FolderRow[],
): HeldCopy[] {
  const names = new Map(
    folders.flatMap((folder) =>
      folder.id ? [[folder.id, folder.name] as const] : [],
    ),
  );
  return documents.flatMap((doc) => {
    const movedTo = doc.drive_held_folder_id
      ? names.get(doc.drive_held_folder_id)
      : undefined;
    return movedTo ? [{ doc, movedTo }] : [];
  });
}

/**
 * "Held back": files Drive moved into a folder more people may see. Sync
 * never widens who sees a file by itself, so each stays where it was until
 * an officer opens it up, the way Drive itself asks before a move changes
 * who has access.
 */
export function HeldCopies({
  held,
  gate,
}: {
  held: HeldCopy[];
  gate: SubscriptionGate;
}) {
  const openUp = useOpenUpDriveCopy();
  const { confirm, confirmDialog } = useConfirmDialog();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function onOpenUp({ doc, movedTo }: HeldCopy) {
    const ok = await confirm({
      title: `Move ${doc.title} to ${movedTo}?`,
      description: `Everyone who can see ${movedTo} will see it.`,
      confirmLabel: "Open it up",
    });
    if (!ok) return;
    setBusyId(doc.id);
    try {
      await openUp.mutateAsync(doc.id);
      toast({ title: `${doc.title} moved to ${movedTo}` });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Couldn't move it",
        description: getErrorMessage(error, "Try again in a moment."),
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-2" aria-labelledby="drive-held-heading">
      <h3 id="drive-held-heading" className="text-body font-medium">
        Held back
      </h3>
      <p className="text-caption text-muted-foreground">
        Someone moved these in Google Drive into a folder more people can see.
        They stay where they were until you open them up.
      </p>
      <ul className="divide-y divide-border">
        {held.map((copy) => (
          <li
            key={copy.doc.id}
            className="flex min-h-11 items-center gap-3 py-1.5"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body">{copy.doc.title}</span>
              <span className="block truncate text-caption text-muted-foreground">
                In {copy.doc.folder ?? "Documents"}, moved to {copy.movedTo} in
                Drive
              </span>
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void onOpenUp(copy)}
              aria-busy={busyId === copy.doc.id}
              {...gate.controlProps(busyId !== null)}
            >
              Open it up
            </Button>
          </li>
        ))}
      </ul>
      {confirmDialog}
    </section>
  );
}
