"use client";

import { ExternalLink, RefreshCw, Unplug } from "lucide-react";
import {
  driveFolderActions,
  driveFolderLine,
  driveFolderUrl,
  driveShortfallNote,
  useDisconnectGoogleDrive,
  useGoogleDriveStatus,
  useSyncGoogleDrive,
} from "@repo/hooks";
import {
  ActionMenuButton,
  type RowMenuEntry,
} from "@/components/shared/row-menu";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { SubscriptionGate } from "@/components/shared/subscription-gate";
import {
  CopyAddress,
  HeldCopies,
  heldCopies,
} from "@/components/documents/drive-folder-panel";
import type {
  ChapterDocument,
  FolderRow,
} from "@/components/documents/document-types";
import { useToast } from "@/lib/hooks/use-toast";
import { getErrorMessage } from "@/lib/utils";

/**
 * The Google Drive folder, managed where it shows (Paul's Drive-as-a-folder
 * pick, 2026-11-25: no Drive page). Over the list of a folder sync made, an
 * officer with Manage documents sees one state line ("Synced today at 8:40
 * PM · 494 files · 753 left out"), with why any were left out. The connected
 * folder's ⋯ holds Open in Google Drive, Sync now and Disconnect; a folder
 * below it has just Open in Google Drive. The connected folder also says when
 * Frapp lost it, with the address to share it with again, and lists the
 * copies sync is holding back. An officer who can't open the connected folder
 * gets its line at the top of Documents instead (`documents-page.tsx`). Comparable: Dropbox's and Box's
 * synced folders, which say their sync state in the folder's own header.
 */
export function DriveFolderLine({
  folder,
  gate,
  documents,
  folders,
}: {
  /**
   * The folder on screen; nothing shows unless sync made it. At the top of
   * Documents, the connected folder itself when the officer can't open it.
   */
  folder: Pick<FolderRow, "name" | "drive_folder_id"> | undefined;
  gate: SubscriptionGate;
  /** The documents the officer sees, for the copies sync is holding back. */
  documents: readonly ChapterDocument[];
  folders: readonly FolderRow[];
}) {
  const status = useGoogleDriveStatus();
  const sync = useSyncGoogleDrive();
  const disconnect = useDisconnectGoogleDrive();
  const { confirm, confirmDialog } = useConfirmDialog();
  const { toast } = useToast();
  const data = status.data;
  const connection = data?.connection;
  const driveId = folder?.drive_folder_id;
  if (!connection || !driveId) return null;
  const { root, lost, canSync } = driveFolderActions(
    connection,
    driveId,
    sync.isPending,
  );
  const held = root ? heldCopies(documents, folders) : [];
  const note = root ? driveShortfallNote(connection) : null;

  async function syncNow() {
    try {
      await sync.mutateAsync();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Couldn't start a sync",
        description: getErrorMessage(error, "Try again in a moment."),
      });
    }
  }

  async function onDisconnect() {
    const ok = await confirm({
      title: `Disconnect ${connection!.folder_name}?`,
      description:
        "Its files leave Documents within a minute. Nothing in Google Drive changes, and you can connect it again later.",
      confirmLabel: "Disconnect",
      tone: "destructive",
    });
    if (!ok) return;
    try {
      await disconnect.mutateAsync();
      toast({ title: "Google Drive disconnected" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Couldn't disconnect",
        description: getErrorMessage(error, "Try again in a moment."),
      });
    }
  }

  const { title, "aria-describedby": describedBy } = gate.controlProps();
  const entries: RowMenuEntry[] = [
    {
      type: "item",
      key: "open",
      label: "Open in Google Drive",
      icon: ExternalLink,
      href: driveFolderUrl(driveId),
      external: true,
    },
    {
      type: "item",
      key: "sync",
      label: "Sync now",
      icon: RefreshCw,
      disabled: !canSync || !gate.allowed,
      title,
      describedBy,
      onSelect: () => void syncNow(),
    },
    { type: "separator", key: "break" },
    {
      type: "item",
      key: "disconnect",
      label: "Disconnect",
      icon: Unplug,
      destructive: true,
      disabled: disconnect.isPending,
      onSelect: () => void onDisconnect(),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex min-h-8 items-center gap-2">
        <p
          aria-live="polite"
          className={
            lost
              ? "min-w-0 flex-1 text-caption text-destructive-text"
              : "min-w-0 flex-1 text-caption text-muted-foreground"
          }
        >
          {root
            ? `Google Drive · ${driveFolderLine(connection)}`
            : "In Google Drive"}
        </p>
        {root ? (
          <ActionMenuButton
            entries={entries}
            label={`More for ${folder.name}`}
            busy={sync.isPending || disconnect.isPending}
          />
        ) : (
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <a
              href={driveFolderUrl(driveId)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Google Drive
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </Button>
        )}
      </div>
      {note ? (
        <p className="text-caption text-muted-foreground">{note}</p>
      ) : null}
      {root && lost && data.service_account_email ? (
        <CopyAddress email={data.service_account_email} />
      ) : null}
      {held.length > 0 ? <HeldCopies held={held} gate={gate} /> : null}
      {confirmDialog}
    </div>
  );
}
