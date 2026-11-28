"use client";

import {
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  useDeleteDocument,
  useDocumentFolders,
  useDocumentLibrary,
  useMarkFilterHold,
  useDocuments,
  useMemberDisplayNames,
  useMyPermissions,
  useSemesters,
  useDocumentTypes,
  useGoogleDriveStatus,
  useViewerUserId,
  type DocumentTypeRow,
} from "@repo/hooks";
import {
  can,
  DOCUMENTS_NO_FOLDER_PARAM_VALUE,
  MINUTES_TYPE_PARAM_VALUE,
  WEB_ADDRESS_PARAMS,
} from "@repo/validation";
import {
  useAddressParams,
  useDeadAddressParam,
} from "@/lib/address/use-address-params";
import { replaceAddress } from "@/lib/address/address";
import { Can } from "@/components/shared/can";
import { PageActions } from "@/components/layout/page-actions";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  SubscriptionNotice,
  useSubscriptionGate,
} from "@/components/shared/subscription-gate";
import { DocumentList } from "@/components/documents/document-list";
import {
  DELETE_DOCUMENT_BODY,
  DELETE_DOCUMENT_LABEL,
  NO_DOCUMENT_FILTERS,
  deleteDocumentTitle,
  documentFolderHues,
  isMarkFiltering,
  isMinutesDocument,
  limitedDocumentCheck,
  markedItems,
  mayUploadNewVersion,
  tierRows,
  type DocumentFilters,
  type DocumentSort,
} from "@repo/hooks/document-library";
import { DocumentViewer } from "@/components/documents/document-viewer";
import { DocumentsPageSkeleton } from "@/components/documents/documents-skeleton";
import { meetingHref } from "@/components/meetings/meeting-copy";
import {
  isFileDocument,
  type ChapterDocument,
  type ChapterDocumentFolder,
  type FolderRow,
} from "@/components/documents/document-types";
import {
  FolderDialog,
  useFolderManagement,
} from "@/components/documents/folder-management";
import {
  DocumentAccessDialog,
  canSetDocumentAccess,
} from "@/components/documents/document-access";
import { FolderMenu, FolderRail } from "@/components/documents/folder-rail";
import { UploadMenu } from "@/components/documents/upload-menu";
import { DriveFolderLine } from "@/components/documents/drive-folder-line";
import { ResourcesViews } from "@/components/documents/resources-views";
import { MarkedStrip } from "@/components/documents/marked-strip";
import { useDocumentMarks } from "@/components/documents/use-document-marks";
import {
  DocumentsPageDropTarget,
  useDocumentUpload,
} from "@/components/documents/upload-document-panel";
import { documentTypeOptions } from "@/lib/documents/upload-defaults";
import { useNetwork } from "@/lib/providers/network-provider";
import { useChapterStore } from "@/lib/stores/chapter-store";
import { useChapterModuleGate } from "@/lib/hooks/use-chapter-module-gate";
import { useToast } from "@/lib/hooks/use-toast";
import { asArray, getErrorMessage } from "@/lib/utils";

/*
  Keyed by chapter, so switching chapters starts the page over: the upload
  draft (file, folder, guesses) and the folder on screen belong to the chapter
  they were made in and must never be offered to the next one.
*/
export function DocumentsPage() {
  return (
    // `useSearchParams` needs a boundary; the skeleton is the page's own.
    <Suspense fallback={<DocumentsPageSkeleton />}>
      <DocumentsPageForLink />
    </Suspense>
  );
}

function DocumentsPageForLink() {
  const chapterId = useChapterStore((state) => state.activeChapterId);
  // The address outlives the remount, so a switch also clears what the
  // address had open: those belong to the chapter they were opened in.
  const shownChapter = useRef(chapterId);
  useEffect(() => {
    if (shownChapter.current === chapterId) return;
    shownChapter.current = chapterId;
    replaceAddress(
      Object.fromEntries(DOCUMENT_ADDRESS.map((name) => [name, null])),
    );
  }, [chapterId]);
  return <ChapterDocumentsPage key={chapterId ?? "none"} />;
}

/**
 * What the address holds on `/documents` (spec § Addresses, #6042): the
 * folder open (`folder=`, its name, or a space for No folder), the file in the
 * viewer (`document=`), the file whose Who can see is open (`access=`) and
 * the Minutes view (`type=minutes`). Back walks the folders and files the
 * member opened, the way Finder and Google Drive do.
 */
const DOC = WEB_ADDRESS_PARAMS.documents;
const DOCUMENT_ADDRESS = [
  DOC.folder,
  DOC.document,
  DOC.access,
  DOC.type,
] as const;

function folderFromParam(value: string | null): string | null {
  if (value === null) return null;
  return value === DOCUMENTS_NO_FOLDER_PARAM_VALUE ? "" : value;
}

function folderToParam(folder: string | null): string | null {
  if (folder === null) return null;
  return folder === "" ? DOCUMENTS_NO_FOLDER_PARAM_VALUE : folder;
}

function ChapterDocumentsPage() {
  const { toast } = useToast();
  const router = useRouter();
  // Every write route on `ChapterDocumentController` (upload URL, confirm,
  // delete) carries no `@FreeTier`, so they are all paid-ops behind the same
  // subscription guard — one gate covers the surface (#841).
  const gate = useSubscriptionGate();
  const { isOffline } = useNetwork();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [search, setSearch] = useState("");
  /*
    Search, the uploader, date, file type, Pinned and Starred filters, and the order all run
    here (`useDocumentLibrary`), over
    the library the list endpoint returns in one response (#3852), as
    `/backwork`'s do: a keystroke re-ranks what is in memory, so there is no
    request per character, and it works offline over what is loaded. Deferred
    so a long library re-ranks behind the keystroke rather than ahead of it.
  */
  const deferredSearch = useDeferredValue(search.trim());
  const address = useAddressParams(DOCUMENT_ADDRESS);
  const { open: openAddress, close: closeAddress } = address;
  // `/documents?type=minutes` is the Minutes view: where `/meetings` lands
  // now that minutes are filed here (#5949), and what a meeting's minutes
  // page goes back to. It lives in the address, so picking Minutes pushes
  // and Back leaves it; the other filters are the member's own.
  const minutesView = address.values[DOC.type] === MINUTES_TYPE_PARAM_VALUE;
  const [ownFilters, setOwnFilters] =
    useState<DocumentFilters>(NO_DOCUMENT_FILTERS);
  const filters = useMemo<DocumentFilters>(
    () =>
      // `ownFilters` never holds Minutes: `setFilters` moves it to the address.
      minutesView ? { ...ownFilters, kind: "minutes" } : ownFilters,
    [minutesView, ownFilters],
  );
  const setFilters = useCallback(
    (next: DocumentFilters) => {
      const wantsMinutes = next.kind === "minutes";
      setOwnFilters(
        wantsMinutes ? { ...next, kind: NO_DOCUMENT_FILTERS.kind } : next,
      );
      if (wantsMinutes && !minutesView) {
        openAddress({ [DOC.type]: MINUTES_TYPE_PARAM_VALUE });
      } else if (!wantsMinutes && minutesView) {
        closeAddress([DOC.type]);
      }
    },
    [minutesView, openAddress, closeAddress],
  );
  const [sort, setSort] = useState<DocumentSort>("name");
  const documentsQuery = useDocuments({ minutes: true });
  const foldersQuery = useDocumentFolders();
  const deleteDoc = useDeleteDocument();

  const documents = useMemo(
    () => asArray<ChapterDocument>(documentsQuery.data),
    [documentsQuery.data],
  );

  /*
    From `GET /v1/documents/folders`, not derived over `documents` (#791).
    Deriving could only ever see folders some document is currently filed
    under, so a freshly created folder — and one whose last document was
    deleted — was invisible, and the officer-set `sort_order` was ignored
    entirely in favour of an alphabetical sort.

    Sorted client-side as well even though the endpoint already returns display
    order: this list is re-rendered optimistically against a reorder that is
    still in flight, and `sort_order` is the field being changed.
  */
  const folders = useMemo(() => {
    return asArray<ChapterDocumentFolder>(foldersQuery.data)
      .filter((folder) => !!folder?.id && !!folder?.name)
      .sort(
        (a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          a.name.localeCompare(b.name),
      );
  }, [foldersQuery.data]);

  /*
    What the rail actually renders.

    The folder list is now its own request, which means it can fail on its own —
    a state that could not exist while the list was derived from the documents
    already in hand. Failing to [] would be the worst answer: the rail would
    quietly claim the chapter has no folders while document rows keep printing
    `· Governance` in their meta line, promising a tab that isn't there.

    So on error we fall back to exactly the pre-#791 behaviour, deriving names
    from the loaded documents. Those entries carry no `id`, which is precisely
    right — without a folder record there is nothing to rename, reorder or
    delete, and the management controls key on `id` being present.

    It derives from the whole library, never what the search or filters
    leave showing, so a folder tab doesn't vanish as someone types (#3852
    made the list unfiltered on the wire, which removed the case that once
    needed a guard here).
  */
  const railFolders = useMemo<FolderRow[]>(() => {
    if (!foldersQuery.isError) return folders;
    const names = new Set<string>();
    for (const doc of documents) {
      if (doc.folder) names.add(doc.folder);
    }
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ id: null, name, sort_order: null }));
  }, [folders, foldersQuery.isError, documents]);

  // Each file's tile wears its folder's hue, in the rail's order (#5576).
  const folderHue = useMemo(
    () => documentFolderHues(railFolders.map((folder) => folder.name)),
    [railFolders],
  );

  const railFolderNames = useMemo(
    () => new Set(railFolders.map((folder) => folder.name)),
    [railFolders],
  );

  const activeFolder = folderFromParam(address.values[DOC.folder]);
  // Opening a folder pushes, so Back walks the folders opened; a folder
  // renamed or deleted under the member moves the address in place.
  /*
    The folder this page last moved to itself (a pick, a rename it followed).
    It isn't judged dead: a renamed folder's new name is missing from the list
    until its re-read lands. Any other folder (from a link, Back or a reload)
    is judged against the list.
  */
  const [chosenFolder, setChosenFolder] = useState<string | null>(null);
  const noteChosen = useCallback((folder: string | null) => {
    setChosenFolder(folder);
  }, []);
  const setActiveFolder = useCallback(
    (folder: string | null) => {
      noteChosen(folder);
      openAddress({
        [DOC.folder]: folderToParam(folder),
        [DOC.document]: null,
        [DOC.access]: null,
      });
    },
    [openAddress, noteChosen],
  );
  const moveActiveFolder = useCallback(
    (folder: string | null) => {
      noteChosen(folder);
      openAddress({ [DOC.folder]: folderToParam(folder) }, { replace: true });
    },
    [openAddress, noteChosen],
  );
  // The document open in the viewer (#3849), by id: the viewer reads the row
  // from `visible`, so it steps through the list as shown. Opening pushes;
  // its X and Escape close by the address's rule; stepping to the previous
  // or next file replaces, so Back closes the viewer rather than walking
  // back through the files seen.
  const openId = address.values[DOC.document];
  const setOpenId = useCallback(
    (id: string | null) => {
      if (id === null) closeAddress([DOC.document]);
      else openAddress({ [DOC.document]: id }, { replace: openId !== null });
    },
    [openAddress, closeAddress, openId],
  );
  /*
    What opened the viewer, so closing goes back to it: a pinned or starred
    file is both a card and a row on All files (#3934), and the viewer's own
    lookup by document would always find the card first.
  */
  const viewerOpener = useRef<HTMLElement | null>(null);
  function openDocument(doc: ChapterDocument) {
    // A meeting's minutes have no file: the row opens the minutes (#5949).
    if (isMinutesDocument(doc)) {
      router.push(meetingHref(doc.meeting_id));
      return;
    }
    viewerOpener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setOpenId(doc.id);
  }
  const { data: permissionsPayload } = useMyPermissions();
  const canUpload = can(
    "chapter_docs:upload",
    permissionsPayload?.permissions ?? [],
  );
  // New minutes, for whoever records them while the module is on (#5949).
  const isModuleEnabled = useChapterModuleGate();
  const canStartMinutes =
    can("meetings:record", permissionsPayload?.permissions ?? []) &&
    (isModuleEnabled?.("meetings") ?? false);

  /*
    The folder tab, then the toolbar's search, filters and order, all local,
    through the hook mobile's s12 runs too (#3938): uploader names and the
    kept-pick rule, the semester window, and the clock. The clock pauses
    while a document is open: a window moving past the open file would drop
    its row and close the viewer mid-read. It catches up when it closes.
  */
  // Pins and the member's stars (#3934); the stars feed the Starred filter.
  const marks = useDocumentMarks();
  /*
    Under Pinned or Starred (#4290), a row the member just unmarked stays
    until the filter changes, and so does the file open in the viewer: a mark
    changing under it (an officer's unpin, a star rolled back, another tab)
    would otherwise drop the row and close the viewer mid-read, which the
    clock's pause can't prevent.
  */
  const { held, hold } = useMarkFilterHold(filters.marks);
  const keep = useMemo(
    () => (openId === null ? held : new Set([...held, openId])),
    [held, openId],
  );
  const {
    folderTotal,
    visible,
    uploaders,
    kinds,
    filters: effectiveFilters,
    semesterKnown,
    filtering,
  } = useDocumentLibrary({
    documents,
    folder: activeFolder,
    search: deferredSearch,
    filters,
    sort,
    namesById: useMemberDisplayNames().byId,
    semesters: useSemesters().data,
    starred: marks.starred.documents,
    keep,
    paused: openId !== null,
  });
  /*
    Pinned and starred (#3934, `chapter-docs.md` § Pinned and starred). On
    the unfiltered All files view the two tiers are cards above the list
    (`MarkedStrip`), and the list keeps its plain order; anywhere else (a
    folder, a search, a filter) they lead the list itself. Either way they
    come first, and nothing is drawn twice on one screen.
  */
  const showStrip =
    activeFolder === null && !filtering && deferredSearch === "";
  // The Minutes filter and nothing else: an empty list there is a chapter
  // with no minutes filed, not a search that missed (#5949).
  const minutesOnly =
    activeFolder === null &&
    deferredSearch === "" &&
    effectiveFilters.kind === "minutes" &&
    effectiveFilters.uploader === null &&
    effectiveFilters.date === null &&
    !isMarkFiltering(effectiveFilters.marks);
  // The add menu's New minutes, opened from that empty line.
  const openNewMinutes = useRef<(() => void) | null>(null);
  // The tiers and the cards come from the builders mobile's s12 uses too
  // (`@repo/hooks/document-library`), so the two apps can't disagree.
  const { starred: starredIds } = marks;
  const tieredVisible = useMemo(
    () => (showStrip ? visible : tierRows(visible, starredIds.documents)),
    [visible, showStrip, starredIds],
  );
  const strip = useMemo(
    () =>
      markedItems({
        folders,
        library: documents,
        shown: visible.map((row) => row.doc),
        starredFolders: starredIds.folders,
        starredDocuments: starredIds.documents,
      }),
    [documents, folders, visible, starredIds],
  );
  // The viewer steps through files only: minutes open on their own page.
  const visibleDocs = useMemo(
    () =>
      tieredVisible
        .map((row) => row.doc)
        .filter((doc) => !isMinutesDocument(doc)),
    [tieredVisible],
  );

  /*
    The upload panel's Type menu: the chapter's own list of document types
    (#3642). Until that list has loaded, or when it can't be read, the common
    types plus every type the documents in hand already use, so the panel still
    offers the spellings the library has.
  */
  const typesQuery = useDocumentTypes();
  const typeRows = useMemo(
    () => asArray<DocumentTypeRow>(typesQuery.data),
    [typesQuery.data],
  );
  const typeOptions = useMemo(
    () =>
      typesQuery.isSuccess
        ? typeRows.map((type) => type.name)
        : documentTypeOptions(documents.map((doc) => doc.document_type)),
    [typesQuery.isSuccess, typeRows, documents],
  );
  const canManageTypes = can(
    "chapter_docs:manage",
    permissionsPayload?.permissions ?? [],
  );
  // The connected Drive folder, where the Upload menu's Google Drive item
  // goes once one is connected. `chapter_docs:manage` only, as on the API.
  const driveStatus = useGoogleDriveStatus({ enabled: canManageTypes });
  const driveRootId = canManageTypes
    ? (driveStatus.data?.connection?.folder_id ?? null)
    : null;
  const driveRoot = driveRootId
    ? folders.find((folder) => folder.drive_folder_id === driveRootId)
    : undefined;
  // An officer the connected folder's list leaves out, or a folder the first
  // pass never made, still gets its line and ⋯ (Disconnect above all), at
  // the top of Documents: managing the connection is `chapter_docs:manage`'s,
  // as on the API, and doesn't wait on seeing the folder.
  const driveConnection = canManageTypes
    ? driveStatus.data?.connection
    : undefined;
  const driveLineFolder = activeFolder
    ? folders.find((folder) => folder.name === activeFolder)
    : !driveRoot && driveConnection
      ? {
          name: driveConnection.folder_name,
          drive_folder_id: driveConnection.folder_id,
        }
      : undefined;
  /*
    Who can see (#3642 piece 1). A file in a limited folder, or with its own
    list, draws a lock; its uploader and whoever manages documents get its
    Who can see control. The list only ever holds what this member sees.
  */
  const viewerId = useViewerUserId();
  const isLimited = useMemo(
    () =>
      limitedDocumentCheck(foldersQuery.data === undefined ? null : folders),
    [foldersQuery.data, folders],
  );
  const canSetAccess = (doc: ChapterDocument) =>
    canSetDocumentAccess(doc, viewerId, {
      manages: canManageTypes,
      uploads: canUpload,
    });
  // Upload a new version (#6055): the same who, as the API decides it.
  const canUploadVersion = (doc: ChapterDocument) =>
    mayUploadNewVersion(doc, viewerId, {
      manages: canManageTypes,
      uploads: canUpload,
    });
  // Who can see, for one file: `access=<id>`, pushed, closed by its rule.
  const accessId = address.values[DOC.access];
  // Only a file this member may set: the same check that draws the row's
  // control, so an address can't open an editor the page wouldn't offer.
  const accessTarget =
    accessId === null
      ? undefined
      : documents.find((doc) => doc.id === accessId);
  const permissionsKnown = permissionsPayload !== undefined;
  const accessDoc =
    accessTarget && permissionsKnown && canSetAccess(accessTarget)
      ? accessTarget
      : null;
  const setAccessDoc = useCallback(
    (doc: ChapterDocument | null) =>
      doc === null
        ? closeAddress([DOC.access])
        : openAddress({ [DOC.access]: doc.id }),
    [openAddress, closeAddress],
  );
  /*
    A folder, file or Who can see the address names that this member can't
    see, or that is gone: once the reads have settled, its parameter is
    replaced away and a short note says so in its place.
  */
  // Read, not failed: a failed read says so itself, and names nothing dead.
  const foldersKnown = foldersQuery.data !== undefined && !foldersQuery.isError;
  const documentsKnown =
    documentsQuery.data !== undefined &&
    !documentsQuery.isPending &&
    !documentsQuery.isError;
  const deadFolder = useDeadAddressParam(
    DOC.folder,
    address.values[DOC.folder],
    foldersKnown &&
      activeFolder !== null &&
      activeFolder !== "" &&
      activeFolder !== chosenFolder &&
      !folders.some((folder) => folder.name === activeFolder),
  );
  // A file's note lasts until the member moves on (another folder, a search,
  // the Minutes view); the folder's own note goes with the next folder.
  const unavailableContext = `${activeFolder ?? ""}\u0000${minutesView}\u0000${deferredSearch}`;
  const deadDocument = useDeadAddressParam(
    DOC.document,
    openId,
    documentsKnown &&
      openId !== null &&
      !documents.some((doc) => doc.id === openId),
    unavailableContext,
  );
  const deadAccess = useDeadAddressParam(
    DOC.access,
    accessId,
    documentsKnown &&
      permissionsKnown &&
      accessId !== null &&
      accessDoc === null,
    unavailableContext,
  );
  const unavailable =
    deadFolder !== null
      ? "That folder isn't available. It may have been renamed or removed, or you may not have access."
      : deadDocument !== null || deadAccess !== null
        ? "That file isn't available. It may have been removed, or you may not have access."
        : null;
  const folderNames = useMemo(
    () => folders.map((folder) => folder.name),
    [folders],
  );
  // A folder import checks its files against the chapter's files: minutes
  // rows have no file to be a copy of.
  const importContext = useMemo(
    () => ({
      typeOptions,
      folders: folderNames,
      documents: documents.filter(isFileDocument),
    }),
    [typeOptions, folderNames, documents],
  );
  const upload = useDocumentUpload(gate, {
    activeFolder,
    typeOptions,
    folders: folderNames,
    documents,
    canUpload,
  });
  /*
    Which rows' deletes are in flight — a set, not a scalar. `useDeleteDocument` is pessimistic —
    the row only disappears once the DELETE round-trips — so without this
    the row's button stays enabled across the whole request. That is a
    second-delete hazard, and it also defeats `confirm-dialog.tsx`'s focus
    guard: the confirmation returns focus to the opener once its ~200ms exit
    ends, usually before the request settles, so focus landed on a control that then
    unmounted and dropped to `<body>`. Marked disabled before the await, the
    guard sees `[disabled]` and sends focus to `#main-content` instead —
    which is the fallback it exists for.
  */
  const [deletingIds, setDeletingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const folderManagement = useFolderManagement({
    gate,
    folders,
    activeFolder,
    setActiveFolder: moveActiveFolder,
    confirm,
    refetchFolders: foldersQuery.refetch,
  });

  const railProps = {
    railFolders,
    activeFolder,
    setActiveFolder,
    gate,
    management: folderManagement,
    marks,
    loadFailed: foldersQuery.isError,
    onRetryLoad: () => void foldersQuery.refetch(),
    folderHue,
  };

  async function handleDelete(doc: ChapterDocument) {
    // README §2 bans `window.confirm` on *every* surface, and §9 specs the
    // replacement. No comment is collected, so this is the truthiness form —
    // the `null`-vs-`""` distinction only matters where a `comment` is asked
    // for, as it is on the two Chapter Ops rejection flows.
    const confirmed = await confirm({
      title: deleteDocumentTitle(doc.title),
      description: DELETE_DOCUMENT_BODY,
      confirmLabel: DELETE_DOCUMENT_LABEL,
      tone: "destructive",
    });
    if (!confirmed) return;
    setDeletingIds((current) => new Set(current).add(doc.id));
    try {
      await deleteDoc.mutateAsync(doc.id);
      toast({
        title: "Document removed",
        description: `${doc.title} was deleted.`,
      });
    } catch (error) {
      toast({
        title: "Couldn't delete document",
        description: getErrorMessage(error, "Try again in a moment."),
        variant: "destructive",
      });
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(doc.id);
        return next;
      });
    }
  }

  /*
    These used to be early returns above everything, which meant a background
    refetch failure unmounted the `Can`-gated upload `Dialog` mid-draft — the
    hazard `subscription-gate.tsx` names for `useGatedDialog` ("a surface can
    unmount its dialog subtree ... while `open` is still true"), and the same
    shape the Chapter Ops slice hit with `{confirmDialog}`. The header, the
    dialog and the notice now always render, and the states scope to the list
    they describe.

    `useDocuments` has no `enabled` gate, so `isPending` is honest here — but
    it is also true for a *paused* query, which is why an offline member with
    no cached documents sat on "Loading chapter documents..." indefinitely.
    The offline branch answers README §4 item 4.

    It is gated on there being nothing loaded, and that qualifier is
    load-bearing. README §4 scopes the offline treatment to "offline, **no
    cached data**", and §10 says background refetches keep stale content in
    place — so replacing a library already in hand with an "unavailable
    offline" card on a WiFi blip would discard what the member can still read.
    Being offline *with* content is the shell's `ConnectionPill`'s job; it
    renders on every route already, so the screen owes a state only when it
    has nothing else to say. Gated on `documents`, not `visible`: a folder
    filter that matches nothing is the empty case, not the offline one.
  */
  const listState =
    isOffline && documents.length === 0
      ? "offline"
      : documentsQuery.isPending
        ? "loading"
        : documentsQuery.isError
          ? "error"
          : visible.length === 0
            ? "empty"
            : "ready";

  return (
    // A container (#4022): beside chat (#3779) the page is narrow while the
    // window is wide, so the folder rail counts the page's own width.
    <div className="@container/docs space-y-6">
      {/* Documents and Backwork, the two views of Resources (#5949). */}
      <ResourcesViews />
      <PageActions>
        <UploadMenu
          gate={gate}
          upload={upload}
          folders={folderNames}
          typeOptions={typeOptions}
          typeRows={typesQuery.isSuccess ? typeRows : null}
          importContext={importContext}
          onOpenDriveFolder={
            driveRoot
              ? () => setActiveFolder(driveRoot.name)
              : driveConnection
                ? () => setActiveFolder(null)
                : undefined
          }
          canUpload={canUpload}
          canManage={canManageTypes}
          canStartMinutes={canStartMinutes}
          minutesOpenerRef={openNewMinutes}
        />
        <Can permission="chapter_docs:upload">
          <DocumentsPageDropTarget
            gate={gate}
            upload={upload}
            activeFolder={activeFolder}
          />
        </Can>
      </PageActions>
      {/*
        The page-narration paragraph that sat here is deleted, not restyled.
        The framework board lists "page-narration paragraphs" under Removed
        outright, and `1f` pin 2 gives a route's main pane one toolbar row with
        "no wrapper card, no description paragraph".

        Nothing in it was load-bearing. "Organizational files, bylaws,
        constitutions, meeting agendas" described a library the member is
        looking at; "every chapter member can download" restated the absence of
        a gate; "upload and delete are permission-gated" was narration about
        controls that are already absent for a member who lacks the permission,
        which is what `Can` is for.
      */}

      {/*
        Disable, don't hide (§5 rule 4): browsing and downloading stay live for
        a lapsed chapter, so the library keeps working — only the writes stop,
        and this says why.
      */}
      {/*
        Scoped to the union of the two permissions that own the gated controls.
        A plain member browsing a fully readable library holds neither, so the
        notice would describe controls they cannot see.
      */}
      {/*
        Silent on purpose, and the only three gates that are. This wraps a
        `SubscriptionNotice` — an explanation of why *another* control is
        disabled — not an affordance. There is nothing here for a member to act
        on, so a second notice saying we cannot check their access states a
        problem about a sentence rather than about anything they can do, and
        stacks a duplicate of the chip the gated control already shows. §5 rule
        4's "disable, don't hide" is about controls; supplementary copy has
        nothing to disable. `can-fallback.spec.tsx` derives this rather than
        listing it: a lone `SubscriptionNotice` child both may and must be
        `null` here.
      */}
      <Can
        anyOf={["chapter_docs:upload", "chapter_docs:manage"]}
        offlineFallback={null}
      >
        <SubscriptionNotice gate={gate} feature="managing documents" />
      </Can>

      {/*
        Flush, not carded. Two `<Card>`s used to sit here, one per column, so
        the rail and the list each paid a hairline, 24px of padding and a title
        block to say what a 220px column beside a list of files already says.
        The board's page body is the surface itself (`1f` pin 2: "no wrapper
        card"), and what survives of each card is its heading — as the section
        label §2 draws above a grouped list, which is what both of these are.

        200px rather than the old 240: the rail holds folder names and a four
        control management row, and the width it was giving up was the list's.
      */}
      {/*
        Files first (#5576): where the page is wide enough the folders are a
        rail beside the list, as Drive's and Dropbox's sidebars are, and cost
        the list no height. Narrower (the tool panel beside chat, a small
        window) the rail would stack seven rows over the first file, so it
        folds into a Folder control at the start of the list's toolbar.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-4 @2xl/docs:grid-cols-[200px_minmax(0,1fr)]">
        <div className="hidden @2xl/docs:block">
          <FolderRail {...railProps} />
        </div>

        <div className="min-w-0 space-y-6">
          {/*
          Also over an empty library: a folder pinned before anything is filed
          still gets its card. Not over the loading, error or offline states,
          which have nothing to say about the cards.
        */}
          {unavailable ? (
            // A dead or forbidden folder or file from the address (§ Addresses).
            <p role="status" className="text-sm text-muted-foreground">
              {unavailable}
            </p>
          ) : null}
          {showStrip && (listState === "ready" || listState === "empty") ? (
            <MarkedStrip
              pinned={strip.pinned}
              starred={strip.starred}
              marks={marks}
              gate={gate}
              onOpenFolder={setActiveFolder}
              onOpenDocument={openDocument}
              folderNames={railFolderNames}
              isLimited={(item) =>
                item.kind === "folder"
                  ? item.folder.who_can_see != null
                  : isLimited(item.doc)
              }
            />
          ) : null}
          <DocumentList
            listState={listState}
            loadError={documentsQuery.error}
            visible={tieredVisible}
            revealId={openId}
            activeFolder={activeFolder}
            total={folderTotal}
            filtering={filtering}
            search={search}
            setSearch={setSearch}
            deferredSearch={deferredSearch}
            filters={effectiveFilters}
            semesterKnown={semesterKnown}
            setFilters={setFilters}
            uploaders={uploaders}
            kinds={kinds}
            sort={sort}
            setSort={setSort}
            onClearFilters={() => {
              setSearch("");
              setFilters(NO_DOCUMENT_FILTERS);
            }}
            onRetry={() => void documentsQuery.refetch()}
            gate={gate}
            deletingIds={deletingIds}
            onOpen={openDocument}
            onDelete={(doc) => void handleDelete(doc)}
            onShowAllFiles={() => setActiveFolder(null)}
            onUpload={canUpload ? () => upload.openPanel() : undefined}
            minutesOnly={minutesOnly}
            onNewMinutes={
              canStartMinutes ? () => openNewMinutes.current?.() : undefined
            }
            marks={marks}
            onHoldRow={hold}
            isLimited={isLimited}
            canSetAccess={canSetAccess}
            canUploadVersion={canUploadVersion}
            onSetAccess={setAccessDoc}
            folderHue={folderHue}
            folderPicker={
              <FolderMenu {...railProps} className="@2xl/docs:hidden" />
            }
            folderLine={
              canManageTypes ? (
                <DriveFolderLine
                  folder={driveLineFolder}
                  gate={gate}
                  documents={documents}
                  folders={folders}
                />
              ) : null
            }
          />
        </div>
      </div>
      {/*
        Rendered last and unconditionally, for the reason `DocumentList`'s states
        no longer are: an offline or error branch that sits over this would
        unmount a pending confirmation without settling its promise, leaving
        `await confirm(...)` hanging forever. That is the two-change
        interaction the Chapter Ops slice shipped and its guard caught.
      */}
      <FolderDialog gate={gate} management={folderManagement} />
      <DocumentAccessDialog
        doc={accessDoc}
        gate={gate}
        onClose={() => setAccessDoc(null)}
      />
      <OpenAddressedDocument
        openId={openId}
        known={documents}
        shown={visibleDocs}
        onReveal={() => {
          // The viewer reads the list as shown, so show all of it.
          if (activeFolder !== null) moveActiveFolder(null);
          setOwnFilters(NO_DOCUMENT_FILTERS);
          if (minutesView) openAddress({ [DOC.type]: null }, { replace: true });
          setSearch("");
        }}
        onLost={() => setOpenId(null)}
      />
      <DocumentViewer
        documents={visibleDocs}
        // Only once its row is shown: the list is still loading, or the
        // reveal above is still clearing what hides it.
        openId={
          openId !== null && visibleDocs.some((doc) => doc.id === openId)
            ? openId
            : null
        }
        onOpenChange={setOpenId}
        openerRef={viewerOpener}
      />

      {confirmDialog}
    </div>
  );
}

/**
 * `/documents?document=<id>`, from a link, Back or a reload: the viewer reads
 * the list as shown, so a folder, filter or search that hides the file is
 * cleared, and a link to a meeting's minutes row (#5949) opens the minutes,
 * replacing the address, since that row is never in the viewer's list. Ask's
 * cited sources open this way (`ask-source-link.ts`). Once the file has been
 * shown, a search or filter the member changes behind the viewer that drops
 * it closes the viewer instead (`onLost`), as before.
 */
function OpenAddressedDocument({
  openId,
  known,
  shown,
  onReveal,
  onLost,
}: {
  openId: string | null;
  known: readonly ChapterDocument[];
  shown: readonly ChapterDocument[];
  onReveal: () => void;
  onLost: () => void;
}) {
  const linkedDoc =
    openId === null ? undefined : known.find((doc) => doc.id === openId);
  const found = linkedDoc !== undefined;
  const minutesId =
    linkedDoc && isMinutesDocument(linkedDoc) ? linkedDoc.meeting_id : null;
  const router = useRouter();
  useEffect(() => {
    if (minutesId) router.replace(meetingHref(minutesId));
  }, [minutesId, router]);
  const visible = found && shown.some((doc) => doc.id === openId);
  // The latest callbacks without making the effect depend on their identity.
  const callbacks = useRef({ onReveal, onLost });
  useEffect(() => {
    callbacks.current = { onReveal, onLost };
  });
  // The file this address has shown, so a later hide is the member's own.
  const shownId = useRef<string | null>(null);
  useEffect(() => {
    if (openId === null) {
      // Closed: the next time the address names a file, it is revealed.
      shownId.current = null;
      return;
    }
    if (visible) {
      shownId.current = openId;
      return;
    }
    if (!found || minutesId) return;
    if (shownId.current === openId) callbacks.current.onLost();
    else callbacks.current.onReveal();
  }, [openId, found, visible, minutesId]);
  return null;
}
