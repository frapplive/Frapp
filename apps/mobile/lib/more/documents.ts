/**
 * Narrowing for s12 (Documents), over `GET /v1/documents` and
 * `GET /v1/documents/folders`.
 *
 * The drawn screen's PINNED section above the list is built since #3934: an
 * officer's pin is `pinned_at` on a folder or a document, so the slot shows a
 * chapter decision, not a guess.
 */
import { formatDay, formatWeekdayDay } from "@repo/formatting";
import {
  effectiveLine,
  isDriveCopy,
  isMinutesDocument,
  minutesDocumentFacts,
  uploadedLine,
  type DocumentMinutes,
  type LibraryDocument,
} from "@repo/hooks/document-library";
import { isRecord, metaLine, num, records, str } from "./narrow";

/**
 * A `GET /v1/documents` row narrowed to what s12 draws and the shared library
 * (`@repo/hooks/document-library`, #3938) searches, filters and orders.
 */
export interface MobileDocument {
  id: string;
  title: string;
  description: string | null;
  folder: string | null;
  document_type: string | null;
  /** The day it takes effect, when an officer set one (#5207). */
  effective_date: string | null;
  uploaded_by: string | null;
  created_at: string;
  /** For the File type filter (`fileKind`); null on older rows. */
  content_type: string | null;
  storage_path: string | null;
  /** When an officer pinned it for the whole chapter, or null (#3934). */
  pinned_at: string | null;
  /**
   * The Google Drive file this is a copy of, or null for an upload (#5157).
   * Drive owns a copy: the row says so and offers no Delete.
   */
  drive_file_id: string | null;
  /** The file's page in Google Drive (#6055), or null for an upload. */
  drive_url: string | null;
  /**
   * Set on a file added by its own Drive link (#5434), null on a copy from
   * the connected Drive folder: a linked file can be moved, a folder copy
   * can't (#5563, `isDriveFolderCopy`).
   */
  drive_link_status: string | null;
  /**
   * The file's own who-can-see list (#5216), left out when it follows its
   * folder. The API only sends what this member may see, so it is only
   * ever drawn as a lock.
   */
  who_can_see?: string[];
  /**
   * Set on the row that files a meeting's posted minutes (#5949): the
   * minutes' id. The row has no file, so a tap opens the minutes, never the
   * share sheet, and it has no Delete.
   */
  meeting_id: string | null;
  /** What a minutes row shows of its minutes; null on a file. */
  minutes: DocumentMinutes | null;
}

export interface DocumentFolder {
  id: string;
  name: string;
  /** When an officer pinned it for the whole chapter, or null (#3934). */
  pinned_at?: string | null;
  /** Who can see it (#5216), left out when everyone can. */
  who_can_see?: string[];
  /** The Drive folder sync made it from (#5220), left out for any other. */
  drive_folder_id?: string;
}

/** A list on a row, or `undefined` for none (everyone, or Same as folder). */
function accessList(row: Record<string, unknown>): string[] | undefined {
  const list = row.who_can_see;
  return Array.isArray(list)
    ? list.filter((entry): entry is string => typeof entry === "string")
    : undefined;
}

/** A minutes row's `minutes`, or `null` when it is missing or malformed. */
function selectMinutes(raw: unknown): DocumentMinutes | null {
  if (!isRecord(raw)) return null;
  const meetingId = str(raw, "meeting_id");
  const eventName = str(raw, "event_name");
  const start = str(raw, "event_start_time");
  if (!meetingId || !eventName || !start) return null;
  return {
    meeting_id: meetingId,
    event_name: eventName,
    event_start_time: start,
    meeting_type: str(raw, "meeting_type") ?? "other",
    other_label: str(raw, "other_label"),
    decision_count: num(raw, "decision_count") ?? 0,
    action_item_count: num(raw, "action_item_count") ?? 0,
    recorded: raw.recorded === true,
    gist: str(raw, "gist"),
  };
}

/**
 * Every drawable document. A row with no id cannot be opened and a row with
 * no title has nothing to show, so both are dropped. Order is left to the
 * library's sort.
 */
export function selectDocuments(data: unknown): MobileDocument[] {
  return records(data)
    .map((row): MobileDocument | null => {
      const id = str(row, "id");
      const title = str(row, "title");
      if (!id || !title) return null;
      return {
        id,
        title,
        description: str(row, "description"),
        folder: str(row, "folder"),
        document_type: str(row, "document_type"),
        effective_date: str(row, "effective_date"),
        uploaded_by: str(row, "uploaded_by"),
        created_at: str(row, "created_at") ?? "",
        content_type: str(row, "content_type"),
        storage_path: str(row, "storage_path"),
        pinned_at: str(row, "pinned_at"),
        drive_file_id: str(row, "drive_file_id"),
        drive_url: str(row, "drive_url"),
        drive_link_status: str(row, "drive_link_status"),
        ...(accessList(row) ? { who_can_see: accessList(row) } : {}),
        meeting_id: str(row, "meeting_id"),
        minutes: selectMinutes(row.minutes),
      };
    })
    .filter((row): row is MobileDocument => !!row);
}

/**
 * The row's second line, web's order without its free-text tail:
 * `"Uploaded August 12 by Jane Doe · Governance · Bylaws · Effective September 1"`,
 * dropping whatever is unknown (the effective day since 2026-11-19, as web's
 * row says it). An unparseable date is left off rather than drawn as "Invalid Date".
 * The description is searched but not drawn: a phone row has no room to
 * truncate it the way web's single line does.
 */
export function documentMeta(
  row: LibraryDocument<MobileDocument>,
  now: Date = new Date(),
): string | null {
  if (row.doc.minutes) return minutesMeta(row.doc, row.doc.minutes, now);
  const uploadedDay = formatDay(row.doc.created_at || null, now);
  return metaLine([
    uploadedLine(uploadedDay, row.uploader, isDriveCopy(row.doc)),
    row.doc.folder,
    row.doc.document_type,
    effectiveLine(formatDay(row.doc.effective_date, now), uploadedDay),
  ]);
}

/**
 * A meeting's minutes' line (#5949): the day the meeting met, then where
 * they are filed and what they hold, in web's words and order
 * (`documentFacts`, web's `document-row.tsx`): "Tuesday, November 18 ·
 * Minutes / Chapter meeting · Recorded · 3 decisions". Web draws the TL;DR's
 * first line where a file has its description; a phone row has no room for
 * that line either, so it is spoken instead ({@link documentOpenHint}).
 */
export function minutesMeta(
  doc: Pick<MobileDocument, "folder">,
  minutes: DocumentMinutes,
  now: Date = new Date(),
): string | null {
  return metaLine([
    formatWeekdayDay(minutes.event_start_time, now),
    doc.folder,
    ...minutesDocumentFacts(minutes),
  ]);
}

/** What a file row says a tap does, to a screen reader. */
const OPEN_FILE_HINT =
  "Opens the share sheet to save it or open it in another app.";

/**
 * What a document's row, tile or card says a tap does, to a screen reader.
 * A meeting's minutes (#5949) open the minutes, and say the TL;DR's first
 * line first, since the row has no room to draw it (rulebook § 3: a fact too
 * wide to draw is still spoken).
 */
export function documentOpenHint(
  doc: Pick<MobileDocument, "meeting_id" | "minutes">,
): string {
  if (!isMinutesDocument(doc)) return OPEN_FILE_HINT;
  return [doc.minutes?.gist, "Opens the minutes."]
    .filter((part): part is string => !!part)
    .map((part) => (/[.!?…]$/.test(part) ? part : `${part}.`))
    .join(" ");
}

/**
 * What a screen reader hears before a minutes row's marks, so it reads as a
 * meeting's minutes rather than a file (#5949).
 */
export const MINUTES_SPOKEN_KIND = "Meeting minutes";

/**
 * The chapter's folders in display order.
 *
 * Read from `GET /v1/documents/folders` rather than derived from the documents
 * themselves, which would silently omit every empty folder — and an empty
 * folder is exactly the one a member is about to be told is empty.
 */
export function selectDocumentFolders(data: unknown): DocumentFolder[] {
  return records(data)
    .map((row) => {
      const id = str(row, "id");
      const name = str(row, "name");
      if (!id || !name) return null;
      return {
        id,
        name,
        pinned_at: str(row, "pinned_at"),
        sort: num(row, "sort_order") ?? 0,
        who_can_see: accessList(row),
        drive_folder_id: str(row, "drive_folder_id"),
      };
    })
    .filter((row): row is NonNullable<typeof row> => !!row)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .map(({ id, name, pinned_at, who_can_see, drive_folder_id }) => ({
      id,
      name,
      pinned_at,
      ...(who_can_see ? { who_can_see } : {}),
      ...(drive_folder_id ? { drive_folder_id } : {}),
    }));
}

/**
 * The signed URL off a single-document read.
 *
 * Re-exported from `@repo/hooks`, which is where it now lives — beside the
 * `useDocument` query that returns the payload it reads, so web and mobile
 * cannot drift apart on the key. It stayed exported from here so this module
 * remains the one import site for the s12 narrowing.
 *
 * The web call sites that read `download_url` and opened `undefined` are fixed
 * (#1040); both spellings are still accepted so a future server-side rename
 * cannot break either client.
 */
export { selectDownloadUrl } from "@repo/hooks";

/**
 * What a file row's long press offers, said to a screen reader (#5563): the
 * long-press sheet's own rows, in its order, so a member hears that Rename
 * or Move to folder is there. Open in Google Drive and Upload a new version
 * stay in the sheet without being named, to keep the hint short.
 */
export function documentActionsHint(target: {
  canPin: boolean;
  canRename: boolean;
  canMove: boolean;
  canDelete: boolean;
}): string {
  const verbs = [
    "star",
    target.canPin ? "pin" : null,
    target.canRename ? "rename" : null,
    target.canMove ? "move" : null,
    target.canDelete ? "delete" : null,
  ].filter((verb): verb is string => verb !== null);
  const said =
    verbs.length === 1
      ? "star or unstar"
      : `${verbs.slice(0, -1).join(", ")} or ${verbs[verbs.length - 1]}`;
  return said.charAt(0).toUpperCase() + said.slice(1);
}
