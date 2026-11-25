import type { DocumentMinutes } from "@repo/hooks/document-library";

export type ChapterDocument = {
  id: string;
  chapter_id: string;
  title: string;
  description: string | null;
  folder: string | null;
  /** Null on a row that files a meeting's minutes (`meeting_id`, #5949). */
  storage_path: string | null;
  /** Null on a row that files a meeting's minutes. */
  uploaded_by: string | null;
  created_at: string;
  content_type: string | null;
  byte_size: number | null;
  document_type: string | null;
  effective_date: string | null;
  /** When an officer pinned it for the whole chapter (#3934). */
  pinned_at?: string | null;
  /**
   * The Google Drive file this is a copy of, or null for an upload (#5157).
   * Drive owns a copy: it has no Delete here.
   */
  drive_file_id?: string | null;
  /** The file's page in Google Drive. */
  drive_url?: string | null;
  /**
   * Who can see it (#3642 piece 1): `null` is the same as its folder, a list
   * narrows the folder's to the tiers, roles and groups it names.
   */
  who_can_see?: string[] | null;
  /**
   * On a Drive copy that Drive moved into a folder more people may see
   * (#5220): that folder's id. The copy stays put until an officer opens it
   * up. Null when the reader can't see that folder.
   */
  drive_held_folder_id?: string | null;
  /**
   * Set on the row that files a meeting's posted minutes (#5949,
   * `spec/behavior/chapter-docs.md` § Minutes): the minutes' id. The row has
   * no file and opens the minutes; only members who may read them get it.
   */
  meeting_id?: string | null;
  /** What a minutes row shows of its minutes; null on a file. */
  minutes?: DocumentMinutes | null;
};

/** A row with a stored file: every row but a meeting's minutes. */
export type ChapterFileDocument = ChapterDocument & { storage_path: string };

/** Whether the row is a file, not a meeting's minutes (#5949). */
export function isFileDocument(
  doc: ChapterDocument,
): doc is ChapterFileDocument {
  return typeof doc.storage_path === "string";
}

export type ChapterDocumentFolder = {
  id: string;
  name: string;
  sort_order: number | null;
  /** When an officer pinned it for the whole chapter (#3934). */
  pinned_at?: string | null;
  /** Who can see it (#3642 piece 1): `null` is everyone. */
  who_can_see?: string[] | null;
  /** Set on a folder Google Drive sync made (#5220): Drive renames and deletes it. */
  drive_folder_id?: string | null;
  /**
   * Set on a folder the minutes flow files into (#5949): `root` for the
   * chapter's Minutes folder, or a repeating meeting's series.
   */
  minutes_series_key?: string | null;
};

/**
 * A row in the folder rail. `id` is `null` for a name recovered from the
 * documents themselves when the folder endpoint is unreachable — those rows
 * filter but cannot be managed, because there is no record to address.
 */
export type FolderRow = {
  id: string | null;
  name: string;
  sort_order: number | null;
  pinned_at?: string | null;
  who_can_see?:
    | string[]
    | null; /** Set on a folder Google Drive sync made (#5220): Drive renames and deletes it. */
  drive_folder_id?: string | null;
};
