"use client";

import { useRef, useState } from "react";
import { ChevronDown, FilePlus2, FolderSync, FolderUp } from "lucide-react";
import { useGoogleDriveStatus, type DocumentTypeRow } from "@repo/hooks";
import { useKeptPanel } from "@repo/hooks/kept-drafts";
import { NEW_ACTION_LABELS } from "@repo/validation";
import {
  MINUTES_DRAFT,
  StartMinutesPanel,
} from "@/components/meetings/start-minutes-panel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SubscriptionGate } from "@/components/shared/subscription-gate";
import {
  UploadDocumentPanel,
  type DocumentUpload,
} from "@/components/documents/upload-document-panel";
import { FolderImportPanel } from "@/components/documents/folder-import-panel";
import type { ImportContext } from "@/lib/documents/folder-import-session";
import {
  DriveFolderPanel,
  driveFolderShown,
  driveNeedsAttention,
} from "@/components/documents/drive-folder-panel";
import type {
  ChapterDocument,
  FolderRow,
} from "@/components/documents/document-types";

/**
 * Documents' one way in (#5576): an outlined Upload button, and beside it a
 * menu holding the rarer ways, Import a folder and Google Drive, as Google
 * Drive's New and Dropbox's Upload menus hold folder uploads and connected
 * sources. Three buttons in a row used to sit over the library; the page's
 * weight goes to the files now.
 *
 * Each panel keeps its own dialog and draft; the menu only opens it.
 */
export function UploadMenu({
  gate,
  upload,
  folders,
  typeOptions,
  typeRows,
  importContext,
  documents,
  folderRows,
  canUpload,
  canManage,
  canStartMinutes,
}: {
  gate: SubscriptionGate;
  upload: DocumentUpload;
  folders: readonly string[];
  typeOptions: readonly string[];
  typeRows: readonly DocumentTypeRow[] | null;
  importContext: ImportContext;
  documents: readonly ChapterDocument[];
  folderRows: readonly FolderRow[];
  /** `chapter_docs:upload`: Upload and Import a folder. */
  canUpload: boolean;
  /** `chapter_docs:manage`: Google Drive, and renaming and deleting types. */
  canManage: boolean;
  /**
   * `meetings:record` with the meetings module on: New minutes (#5949).
   * Posted minutes are filed here, so starting them is one more way in, as
   * the Meetings page's New minutes was before that page folded into
   * Documents.
   */
  canStartMinutes: boolean;
}) {
  const [startingMinutes, setStartingMinutes] = useState(false);
  // Reopens on return when the page was left mid-form (#4593).
  useKeptPanel({
    page: "documents",
    form: MINUTES_DRAFT,
    open: startingMinutes,
    setOpen: setStartingMinutes,
    ready: canStartMinutes,
  });
  const openImport = useRef<(() => void) | null>(null);
  const openDrive = useRef<(() => void) | null>(null);
  // Drive's status is `chapter_docs:manage` only on the API, so nobody else
  // asks for it (the panel's own read shares this one's cache).
  const drive = useGoogleDriveStatus({ enabled: canManage });
  const driveData = canManage ? drive.data : undefined;
  const showDrive = driveFolderShown(driveData);
  const needsAttention = driveNeedsAttention(driveData);
  // The items carry the gate's reason and its notice, as the buttons did.
  const { title, "aria-describedby": describedBy } = gate.controlProps();
  const gateReason = { title, "aria-describedby": describedBy };
  const hasMenu = canUpload || showDrive || canStartMinutes;
  if (!hasMenu) return null;

  return (
    <div className="flex items-center">
      {canUpload ? (
        <UploadDocumentPanel
          gate={gate}
          upload={upload}
          folders={folders}
          typeOptions={typeOptions}
          typeRows={typeRows}
          canManageTypes={canManage}
          triggerClassName="rounded-r-none"
        />
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="action"
            size="toolbar"
            className={canUpload ? "-ml-px rounded-l-none px-2" : "gap-2"}
            aria-label={
              needsAttention
                ? "More ways to add documents: Google Drive needs attention"
                : "More ways to add documents"
            }
          >
            {canUpload ? null : "Add documents"}
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
            {needsAttention ? (
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-destructive"
              />
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[200px]">
          {canUpload ? (
            <DropdownMenuItem
              disabled={!gate.allowed}
              {...gateReason}
              onSelect={() => openImport.current?.()}
            >
              <FolderUp className="h-4 w-4" aria-hidden="true" />
              Import a folder
            </DropdownMenuItem>
          ) : null}
          {canStartMinutes ? (
            // Minutes aren't a subscription-gated write here: the panel's
            // own start says so if the chapter's subscription refuses it.
            <DropdownMenuItem onSelect={() => setStartingMinutes(true)}>
              <FilePlus2 className="h-4 w-4" aria-hidden="true" />
              {NEW_ACTION_LABELS.newMinutes}
            </DropdownMenuItem>
          ) : null}
          {showDrive ? (
            <DropdownMenuItem
              disabled={!gate.allowed}
              {...gateReason}
              onSelect={() => openDrive.current?.()}
            >
              <FolderSync className="h-4 w-4" aria-hidden="true" />
              {driveData?.connection ? "Google Drive" : "Connect Google Drive"}
              {needsAttention ? (
                <span className="sr-only">: needs attention</span>
              ) : null}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {canUpload ? (
        <FolderImportPanel
          gate={gate}
          context={importContext}
          openerRef={openImport}
        />
      ) : null}
      {canStartMinutes ? (
        <StartMinutesPanel
          open={startingMinutes}
          onOpenChange={setStartingMinutes}
        />
      ) : null}
      {canManage ? (
        <DriveFolderPanel
          gate={gate}
          documents={documents}
          folders={folderRows}
          openerRef={openDrive}
        />
      ) : null}
    </div>
  );
}
