import {
  contentTypeByExtension,
  fileExtension,
  minutesRowTags,
  ROLE_COLOR_PALETTE,
  roleColor,
  type RoleColorHex,
  latestSemesterArchive,
} from "@repo/validation";
import { folderPlace } from "./document-folder-tree";
import { fnv1a32 } from "./member-avatar-color";
import { fuzzyMatchWords, normalizeWords } from "./fuzzy-match";

/**
 * The Documents library's search, filters and order (#3852), kept free of
 * React so they can be tested on plain rows. Web's `/documents` and mobile's
 * Documents screen both run it (#3938), so the two apps find, narrow and order
 * a chapter's files the same way.
 *
 * All of it runs on the client, as web `/backwork`'s does (`backwork-library.ts`):
 * `GET /v1/documents` returns the chapter's whole library in one response, so
 * a keystroke or a filter re-ranks what is already in memory instead of asking
 * the server again, and it works offline over what is loaded. The API reads
 * the library in pages, so a chapter past PostgREST's 1,000-row `max_rows`
 * gets every file (#5585; until then the response was cut at the cap, which
 * hid Shawn's oldest imported files).
 */

/**
 * PostgREST's `max_rows` (`supabase/config.toml`): an unpaginated list read
 * returns at most this many rows. Web's backwork list meets the same cap
 * (`BACKWORK_LIST_CAP` is this constant).
 */
export const POSTGREST_MAX_ROWS = 1000;

/** The delete confirm, both apps: title, body and confirm label. */
export function deleteDocumentTitle(title: string): string {
  return `Delete ${title}?`;
}
export const DELETE_DOCUMENT_BODY =
  "This removes the file from chapter storage immediately and cannot be undone.";
export const DELETE_DOCUMENT_LABEL = "Delete document";

/**
 * The fields of a `GET /v1/documents` row the library reads. Structural, so
 * web's `ChapterDocument` and mobile's narrowed rows both fit.
 */
export type LibrarySourceDocument = {
  id: string;
  title: string;
  description?: string | null;
  folder?: string | null;
  document_type?: string | null;
  uploaded_by: string | null;
  created_at: string;
  /** The declared MIME type; null on rows filed before 2026-08-31. */
  content_type?: string | null;
  /** The storage key, whose extension stands in when `content_type` is null. */
  storage_path?: string | null;
  /** When an officer pinned it for the chapter (#3934); null or absent when not. */
  pinned_at?: string | null;
  /**
   * Set on the row that files a meeting's posted minutes (#5949): the
   * minutes' id. The row has no file; it opens the minutes.
   */
  meeting_id?: string | null;
  /** What a minutes row shows of its minutes; null or absent on a file. */
  minutes?: DocumentMinutes | null;
};

/**
 * What a minutes row shows of its minutes (`GET /v1/documents?minutes=true`,
 * #5949): the facts the Minutes list drew on each row.
 */
export type DocumentMinutes = {
  meeting_id: string;
  event_name: string;
  event_start_time: string;
  meeting_type: string;
  other_label: string | null;
  decision_count: number;
  action_item_count: number;
  recorded: boolean;
  gist: string | null;
};

/** Whether the row files a meeting's minutes, not a file. */
export function isMinutesDocument<
  D extends Pick<LibrarySourceDocument, "meeting_id">,
>(doc: D): doc is D & { meeting_id: string } {
  return typeof doc.meeting_id === "string" && doc.meeting_id !== "";
}

/**
 * A minutes row's meta line after its day: "Recorded", "3 decisions",
 * "5 action items", in the Minutes list's own words (`minutesRowTags`), so a
 * member decides by the same facts the list gave them. The meeting's day leads
 * the line and the TL;DR's first line follows it; each app formats and joins.
 */
export function minutesDocumentFacts(minutes: DocumentMinutes): string[] {
  return minutesRowTags({
    status: "posted",
    recorded: minutes.recorded,
    decision_count: minutes.decision_count,
    action_item_count: minutes.action_item_count,
  }).map((tag) => tag.label);
}

/**
 * A file format group, for the File type filter and for search (#3938, Shawn's
 * addition; Google Drive's Type filter).
 */
export type FileKind =
  "minutes" | "pdf" | "word" | "slides" | "spreadsheet" | "image" | "other";

/** The groups in the order the filter offers them. */
const FILE_KIND_OPTIONS: readonly { value: FileKind; label: string }[] = [
  // A meeting's posted minutes, filed as a row with no file (#5949).
  { value: "minutes", label: "Minutes" },
  { value: "pdf", label: "PDF" },
  { value: "word", label: "Word" },
  { value: "slides", label: "Slides" },
  { value: "spreadsheet", label: "Spreadsheet" },
  { value: "image", label: "Image" },
  { value: "other", label: "Other" },
];

/**
 * The words a member types to mean a group. They match a query word exactly
 * or as its start ("spread", "power"), never as a near miss: "word" is one
 * letter from "work", and "sheet" from "sheep".
 */
const FILE_KIND_WORDS: Record<FileKind, readonly string[]> = {
  minutes: ["minutes", "meeting"],
  pdf: ["pdf"],
  word: ["word", "doc", "docx"],
  slides: ["slides", "slide", "powerpoint", "presentation", "deck"],
  spreadsheet: ["spreadsheet", "excel", "sheet", "sheets", "csv"],
  image: ["image", "photo", "picture"],
  other: [],
};

/**
 * The type a stored extension stands for, when a row recorded none: every
 * extension the upload allowlist binds (its widest table, `archive`, so the
 * two can't drift), plus the ones it never admitted that older rows still
 * carry, which need a group and a label too. No prototype, so a file named
 * `x.constructor` reads as unknown.
 */
const EXTENSION_TYPE: Readonly<Record<string, string>> = Object.assign(
  Object.create(null),
  contentTypeByExtension("archive"),
  {
    odt: "application/vnd.oasis.opendocument.text",
    rtf: "application/rtf",
    key: "application/vnd.apple.keynote",
    odp: "application/vnd.oasis.opendocument.presentation",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    heif: "image/heif",
    svg: "image/svg+xml",
  },
);

function kindOfMime(type: string): FileKind {
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("image/")) return "image";
  if (
    type === "application/msword" ||
    type.includes("wordprocessingml") ||
    type === "application/vnd.oasis.opendocument.text" ||
    type === "application/rtf" ||
    type === "text/rtf"
  ) {
    return "word";
  }
  if (
    type === "application/vnd.ms-powerpoint" ||
    type.includes("presentationml") ||
    type === "application/vnd.oasis.opendocument.presentation" ||
    type === "application/vnd.apple.keynote" ||
    type === "application/x-iwork-keynote-sffkey"
  ) {
    return "slides";
  }
  if (
    type === "application/vnd.ms-excel" ||
    type.includes("spreadsheetml") ||
    type === "application/vnd.oasis.opendocument.spreadsheet" ||
    type === "text/csv"
  ) {
    return "spreadsheet";
  }
  return "other";
}

/** The name a type goes by in the viewer ("Excel spreadsheets can't be previewed yet"). */
const TYPE_LABEL: Readonly<Record<string, string>> = Object.assign(
  Object.create(null),
  {
    "application/msword": "Word document",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "Word document",
    "application/vnd.ms-excel": "Excel spreadsheet",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      "Excel spreadsheet",
    "application/vnd.ms-powerpoint": "PowerPoint deck",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      "PowerPoint deck",
    "application/vnd.apple.keynote": "Keynote deck",
    "application/vnd.oasis.opendocument.text": "OpenDocument text file",
    "application/vnd.oasis.opendocument.spreadsheet":
      "OpenDocument spreadsheet",
    "application/vnd.oasis.opendocument.presentation":
      "OpenDocument presentation",
    "application/rtf": "Rich text document",
    "text/rtf": "Rich text document",
    "text/plain": "Text file",
    "text/csv": "CSV file",
    // "Photo" is for what the viewer draws; these it offers as a download, and
    // the card names them ("HEIC photos can't be previewed yet").
    "image/heic": "HEIC photo",
    "image/heif": "HEIF photo",
    "image/tiff": "TIFF image",
    "image/avif": "AVIF image",
    "image/svg+xml": "SVG image",
  },
);

const KIND_LABEL: Record<FileKind, string> = {
  minutes: "Minutes",
  pdf: "PDF",
  word: "Word document",
  slides: "Slide deck",
  spreadsheet: "Spreadsheet",
  image: "Photo",
  other: "File",
};

/**
 * The hues a folder can wear, in this order: the role palette minus Slate,
 * which stays for a file in no folder. The order is part of the hash, so
 * reordering it recolours every folder.
 */
const FOLDER_HUES: readonly RoleColorHex[] = ROLE_COLOR_PALETTE.filter(
  (swatch) => swatch.key !== "slate",
).map((swatch) => swatch.hex);

/**
 * The hue a file's tile wears in the library list (#5576): its folder's, so
 * a library reads by where things are filed before the titles do, as
 * Dropbox's and Drive's coloured folders let it. Build it from the folders
 * the member has, in the rail's order: each folder the rail draws at the top
 * takes the palette in turn, so the first nine never share a hue (a hash put
 * five ordinary folders on two), and a folder drawn under another wears its
 * top folder's hue. "The top" is the rail's own tree rule (`folderPlace`):
 * "Rush / 2024" sits under Rush only when a folder named Rush exists. A file
 * in no folder is Slate; one whose folder isn't in the list (the folders
 * failed to load) falls back to a hash of its name.
 *
 * Because the order is the member's own list, a folder hidden from a member
 * (`chapter-docs.md` § Who can see), or one added or moved ahead of the
 * others, shifts the colours after it: two members who see different
 * folders can see different colours. Distinct colours on one screen won
 * over the same colour for everyone, which a hash can only promise by
 * letting folders collide.
 *
 * Folder, not file type: a chapter library is nearly all PDFs, so a hue per
 * type painted the seeded demo one colour top to bottom. A hue names a
 * place, never a state (`foundations.md` § A place's hue); the role palette
 * leaves out gold and red, so no tile reads as the accent, a mention or an
 * error.
 */
export function documentFolderHues(
  folders: readonly string[],
): (folder: string | null | undefined) => RoleColorHex {
  const names = new Set(folders);
  const topOf = (name: string): string => {
    let top = name;
    for (;;) {
      const { parentName } = folderPlace(top, names);
      if (!parentName) return top;
      top = parentName;
    }
  };
  const order = new Map<string, number>();
  for (const name of folders) {
    const top = topOf(name);
    if (!order.has(top)) order.set(top, order.size);
  }
  return (folder) => {
    if (!folder) return roleColor("slate");
    const index = names.has(folder)
      ? order.get(topOf(folder))!
      : fnv1a32(folder.toLowerCase());
    return FOLDER_HUES[index % FOLDER_HUES.length]!;
  };
}

/** What one file is, for every surface that groups, names or previews it. */
export type ClassifiedFile = {
  /**
   * The type the file is taken to be: the declared `content_type` (base type,
   * lowercased), or, when that is missing or the generic
   * `application/octet-stream`, the type its stored extension stands for.
   * Null when neither says.
   */
  type: string | null;
  /** Its format group, for the File type filter and search. */
  kind: FileKind;
  /** Its name for people: "PDF", "Excel spreadsheet", "Photo", "File". */
  label: string;
  /**
   * The type it groups and names by: the declared type, or the stored
   * extension's when the declared one is absent or unrecognised. The phone
   * saves a document under this type's extension (`document-file.ts`), so the
   * file it hands over is the kind its tile says it is.
   */
  groupType: string | null;
};

/**
 * The one classifier for a chapter document's file (#3959): the File type
 * filter, search, and the web viewer's preview and label all read it, so a
 * file is never an Image in the filter and a "File" in the viewer. The
 * declared type wins; the stored extension stands in only when no useful type
 * was recorded (rows filed before 2026-08-31, or a client that sent
 * `application/octet-stream`). Whether a type previews is the viewer's call
 * (`previewKind`), made on {@link ClassifiedFile.type}.
 */
export function classifyFile(
  doc: Pick<
    LibrarySourceDocument,
    "content_type" | "storage_path" | "meeting_id"
  >,
): ClassifiedFile {
  // A meeting's minutes are no file at all: their own group, nothing to
  // preview or save.
  if (isMinutesDocument(doc)) {
    return {
      type: null,
      kind: "minutes",
      label: KIND_LABEL.minutes,
      groupType: null,
    };
  }
  const declared =
    doc.content_type?.split(";")[0]?.trim().toLowerCase() || null;
  const type =
    declared && declared !== "application/octet-stream" ? declared : null;
  const name = doc.storage_path?.split("/").pop() ?? "";
  const fromName = EXTENSION_TYPE[fileExtension(name)] ?? null;
  if (type === null) return describe(fromName, fromName);
  // A declared type nothing here recognises (`text/plain` on a `.csv`, an
  // old `application/x-pdf`) groups and names by the extension, as the filter
  // always has. `type` stays what was declared: preview never goes past it.
  const kind = kindOfMime(type);
  if (kind === "other" && fromName) return describe(type, fromName);
  return describe(type, type);
}

function describe(type: string | null, groupBy: string | null): ClassifiedFile {
  const kind = groupBy ? kindOfMime(groupBy) : "other";
  return {
    type,
    kind,
    label: (groupBy && TYPE_LABEL[groupBy]) || KIND_LABEL[kind],
    groupType: groupBy,
  };
}

/** A document's format group ({@link classifyFile}). Anything unrecognised is Other. */
export function fileKind(
  doc: Pick<
    LibrarySourceDocument,
    "content_type" | "storage_path" | "meeting_id"
  >,
): FileKind {
  return classifyFile(doc).kind;
}

/** One choice in the Uploaded by filter. */
export type UploaderOption = { value: string; label: string };

export type DocumentSort = "name" | "newest" | "oldest" | "uploader";

export const SORT_OPTIONS: readonly { value: DocumentSort; label: string }[] = [
  { value: "name", label: "Name A–Z" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "uploader", label: "Uploader A–Z" },
];

export type DateFilter =
  | { preset: "semester" }
  | { preset: "30d" }
  | { preset: "custom"; from: string | null; to: string | null };

/**
 * The Pinned and Starred filters (#4290, Shawn's ask; Google Drive's Starred
 * filter). Each is on or off. With both on a file shows when it is either, so
 * the pair reads as "what's been marked" rather than narrowing to the few
 * files that are both.
 */
export type DocumentMarkFilter = { pinned: boolean; starred: boolean };

export const NO_MARK_FILTER: DocumentMarkFilter = {
  pinned: false,
  starred: false,
};

export type DocumentFilters = {
  /** `uploaded_by`, or null for anyone. */
  uploader: string | null;
  date: DateFilter | null;
  /** A format group, or null for any. */
  kind: FileKind | null;
  /** Pinned for the chapter, starred by this member, or either (#4290). */
  marks: DocumentMarkFilter;
};

export const NO_DOCUMENT_FILTERS: DocumentFilters = {
  uploader: null,
  date: null,
  kind: null,
  marks: NO_MARK_FILTER,
};

/** Whether the Pinned or Starred filter is on. */
export function isMarkFiltering(marks: DocumentMarkFilter): boolean {
  return marks.pinned || marks.starred;
}

/**
 * A file passes the mark filter: off, pinned or starred as asked, or held
 * (`keep`): a file the member unmarked or has open stays put until the filter
 * changes, rather than vanishing under their cursor (#4290).
 */
function inMarkFilter(
  doc: LibrarySourceDocument,
  marks: DocumentMarkFilter,
  starred: ReadonlySet<string>,
  keep: ReadonlySet<string>,
): boolean {
  if (!isMarkFiltering(marks) || keep.has(doc.id)) return true;
  return (
    (marks.pinned && !!doc.pinned_at) || (marks.starred && starred.has(doc.id))
  );
}

/** A document with its uploader's name resolved and its words normalised once. */
export type LibraryDocument<
  D extends LibrarySourceDocument = LibrarySourceDocument,
> = {
  doc: D;
  uploader: string | null;
  words: readonly string[];
  /** The same text lowercased, for the substring match the title search had. */
  text: string;
  kind: FileKind;
};

export function toLibraryDocuments<D extends LibrarySourceDocument>(
  documents: readonly D[],
  uploaderName: (userId: string) => string | null,
): LibraryDocument<D>[] {
  return documents.map((doc) => {
    const uploader = doc.uploaded_by ? uploaderName(doc.uploaded_by) : null;
    const text = searchText(doc, uploader);
    return {
      doc,
      uploader,
      words: normalizeWords(text),
      text: text.toLowerCase(),
      kind: fileKind(doc),
    };
  });
}

/**
 * "Uploaded Sep 26 by Ryan Castellano", dropping whichever half is unknown:
 * the lead of each app's row meta line. A copy of a file in the chapter's
 * Google Drive folder (#5157) says where it came from instead of who filed
 * it, since the officer who connected the folder didn't pick each file:
 * "From Google Drive, added Sep 26".
 */
export function uploadedLine(
  day: string | null,
  uploader: string | null,
  fromDrive = false,
): string | null {
  if (fromDrive) {
    return day ? `From Google Drive, added ${day}` : "From Google Drive";
  }
  if (!day && !uploader) return null;
  return ["Uploaded", day, uploader ? `by ${uploader}` : null]
    .filter(Boolean)
    .join(" ");
}

/**
 * "Effective September 26", left out when it is the day the file was uploaded: the
 * upload panel starts the date on Today and the phone sends the upload day
 * (#5207), so a matching date says nothing the Uploaded line doesn't. Both
 * apps' rows say it after the folder and type (2026-11-19; the phone's row
 * left it off until then). Takes the two days already formatted.
 */
export function effectiveLine(
  effectiveDay: string | null,
  uploadedDay: string | null,
): string | null {
  if (!effectiveDay || effectiveDay === uploadedDay) return null;
  return `Effective ${effectiveDay}`;
}

/** Everything a member might type to find a document. */
function searchText(
  doc: LibrarySourceDocument,
  uploader: string | null,
): string {
  return [
    doc.title,
    doc.description,
    uploader,
    doc.folder,
    doc.document_type,
    // What the minutes said, in the line their row shows.
    doc.minutes?.gist,
  ]
    .filter((part) => part !== null && part !== undefined && part !== "")
    .join(" ");
}

/**
 * Where "this semester" starts: after the end of the most recently created
 * archive's `end_date` day. That is the window `spec/behavior/semester-rollover.md`
 * defines, picked the way the API picks it (`findLatestByChapter`, newest
 * `created_at`) and read the way `resolveWindowSince('semester')` reads it
 * (end of that day in UTC, exclusive). Null when the chapter has never rolled
 * over, so "this semester" is everything.
 */
export function semesterSince(
  archives: readonly { end_date: string; created_at?: string }[],
): Date | null {
  const latest = latestSemesterArchive(archives);
  return latest
    ? new Date(`${latest.end_date.slice(0, 10)}T23:59:59.999Z`)
    : null;
}

/**
 * What a date filter is read against. `semesterSince` is `undefined` while
 * the archives are loading or failed to load: the semester is unknown, which
 * is not the same as a chapter that never rolled over (`null`).
 */
export type DateContext = { now: Date; semesterSince: Date | null | undefined };

/**
 * What `queryDocuments` reads besides the rows: the dates, and the ids of the
 * files this member starred, for the Starred filter. A star is the member's
 * own (`GET /v1/documents/stars`), so it isn't on the row the way a pin is.
 */
export type QueryContext = DateContext & {
  starred?: ReadonlySet<string>;
  /** Files the Pinned and Starred filters keep whatever their marks (`inMarkFilter`). */
  keep?: ReadonlySet<string>;
};

const NO_STARS: ReadonlySet<string> = new Set();

/** `YYYY-MM-DD` from a date input, as the start of that local day. */
function dayStart(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Whether `createdAt` falls inside the filter, read in the viewer's timezone. */
export function inDateFilter(
  createdAt: string,
  filter: DateFilter,
  { now, semesterSince: since }: DateContext,
): boolean {
  const at = new Date(createdAt);
  if (Number.isNaN(at.getTime())) return false;
  if (filter.preset === "30d") {
    return now.getTime() - at.getTime() <= 30 * 24 * 60 * 60 * 1000;
  }
  // Unknown (`undefined`) never reaches here: `queryDocuments` drops the filter.
  if (filter.preset === "semester") return since == null || at > since;
  const from = filter.from ? dayStart(filter.from) : null;
  const toStart = filter.to ? dayStart(filter.to) : null;
  // Inclusive of the whole `to` day.
  const until = toStart
    ? new Date(toStart.getFullYear(), toStart.getMonth(), toStart.getDate() + 1)
    : null;
  return (!from || at >= from) && (!until || at < until);
}

/**
 * Whether a date filter narrows anything. "Custom range" with neither date set
 * is a filter in waiting: it matches everything, so the chip stays untinted
 * and the page doesn't read it as filtering.
 */
export function isActiveDateFilter(
  filter: DateFilter | null,
  semesterKnown = true,
): filter is DateFilter {
  if (filter === null) return false;
  if (filter.preset === "semester") return semesterKnown;
  return (
    filter.preset !== "custom" || filter.from !== null || filter.to !== null
  );
}

/** Whether a search or a filter is narrowing the list. */
export function isFiltering(
  query: string,
  filters: DocumentFilters,
  semesterKnown: boolean,
): boolean {
  return (
    query.trim() !== "" ||
    filters.uploader !== null ||
    filters.kind !== null ||
    isMarkFiltering(filters.marks) ||
    isActiveDateFilter(filters.date, semesterKnown)
  );
}

/** A short label for the date chip once a filter is on. */
export function dateFilterLabel(filter: DateFilter): string {
  if (filter.preset === "semester") return "This semester";
  if (filter.preset === "30d") return "Last 30 days";
  const { from, to } = filter;
  if (from && to) return `${from} to ${to}`;
  if (from) return `Since ${from}`;
  if (to) return `Until ${to}`;
  return "Custom range";
}

const byTitle = (a: LibraryDocument, b: LibraryDocument) =>
  (a.doc.title || "").localeCompare(b.doc.title || "");

const COMPARE: Record<
  DocumentSort,
  (a: LibraryDocument, b: LibraryDocument) => number
> = {
  name: byTitle,
  newest: (a, b) =>
    b.doc.created_at.localeCompare(a.doc.created_at) || byTitle(a, b),
  oldest: (a, b) =>
    a.doc.created_at.localeCompare(b.doc.created_at) || byTitle(a, b),
  // Unknown uploaders last, then by name, then newest first within one person.
  uploader: (a, b) =>
    (a.uploader === null ? 1 : 0) - (b.uploader === null ? 1 : 0) ||
    (a.uploader ?? "").localeCompare(b.uploader ?? "") ||
    b.doc.created_at.localeCompare(a.doc.created_at),
};

/**
 * Filters, searches, then orders. The chosen sort orders the results whether
 * or not there is a query: the member picked it, so a match's rank doesn't
 * override it. Search forgives typos the way backwork's does.
 */
export function queryDocuments<D extends LibrarySourceDocument>(
  rows: readonly LibraryDocument<D>[],
  query: string,
  filters: DocumentFilters,
  sort: DocumentSort,
  dates: QueryContext,
): LibraryDocument<D>[] {
  const date = isActiveDateFilter(
    filters.date,
    dates.semesterSince !== undefined,
  )
    ? filters.date
    : null;
  const starred = dates.starred ?? NO_STARS;
  const keep = dates.keep ?? NO_STARS;
  const filtered = rows.filter(
    (row) =>
      (filters.uploader === null || row.doc.uploaded_by === filters.uploader) &&
      (filters.kind === null || row.kind === filters.kind) &&
      inMarkFilter(row.doc, filters.marks, starred, keep) &&
      (date === null || inDateFilter(row.doc.created_at, date, dates)),
  );
  const needle = query.trim().toLowerCase();
  if (!needle) return [...filtered].sort(COMPARE[sort]);
  // Words, prefixes and near misses (backwork's matcher), plus any plain
  // substring, which the server's title search matched and members rely on:
  // "laws" in "bylaws", "2026" in "FY2026", or a query that is only "_".
  // A query of punctuation alone has no words, and the fuzzy matcher returns
  // every row for that; only the substring match then applies.
  const fuzzy = new Set(
    normalizeWords(needle).length > 0
      ? fuzzyMatchWords(
          filtered,
          needle,
          (row) => row.words,
          {},
          (row, word) => matchKindWord(row.kind, word),
        ).map((result) => result.item)
      : [],
  );
  return filtered
    .filter((row) => fuzzy.has(row) || row.text.includes(needle))
    .sort(COMPARE[sort]);
}

/**
 * A query word against the document's format words ("pdf", "slides",
 * "excel"): exact, or as the start of one from three letters, scored as the
 * fuzzy matcher scores an exact word and a prefix. No near misses.
 */
function matchKindWord(
  kind: FileKind,
  word: string,
): { score: number; hit: null } {
  let score = 0;
  for (const kindWord of FILE_KIND_WORDS[kind]) {
    if (kindWord === word) return { score: 3, hit: null };
    if (word.length >= 3 && kindWord.startsWith(word)) score = 2.5;
  }
  return { score, hit: null };
}

/**
 * The File type filter's choices: only the groups in `kinds` (the library's,
 * plus any kept pick), in the fixed order.
 */
export function kindOptions(
  kinds: Iterable<FileKind>,
): { value: FileKind; label: string }[] {
  const present = new Set(kinds);
  return FILE_KIND_OPTIONS.filter((option) => present.has(option.value));
}

/** The Uploaded by chip's choices: only people who have uploaded something. */
export function uploaderOptions(
  rows: readonly LibraryDocument[],
): UploaderOption[] {
  const people = new Map<string, string>();
  for (const row of rows) {
    if (
      row.doc.uploaded_by &&
      row.uploader &&
      !people.has(row.doc.uploaded_by)
    ) {
      people.set(row.doc.uploaded_by, row.uploader);
    }
  }
  return [...people]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The three tiers Documents lists folders and files in (#3934,
 * `spec/behavior/chapter-docs.md` § Pinned and starred): what officers pinned
 * for the whole chapter, then what this member starred, then the rest. Each
 * tier keeps the order it was given, so the officers' folder order and the
 * member's chosen sort still apply inside it. A pinned item the member also
 * starred sits in Pinned only, so nothing is listed twice.
 */
export type MarkTiers<T> = { pinned: T[]; starred: T[]; rest: T[] };

export function tierByMarks<T>(
  items: readonly T[],
  isPinned: (item: T) => boolean,
  isStarred: (item: T) => boolean,
): MarkTiers<T> {
  const tiers: MarkTiers<T> = { pinned: [], starred: [], rest: [] };
  for (const item of items) {
    if (isPinned(item)) tiers.pinned.push(item);
    else if (isStarred(item)) tiers.starred.push(item);
    else tiers.rest.push(item);
  }
  return tiers;
}

/** A pinned or starred thing above the list: a folder, or a single file. */
export type MarkedItem<F, D> =
  { kind: "folder"; folder: F; count: number } | { kind: "document"; doc: D };

/**
 * The Pinned and Starred groups both apps draw above All files (#3934): the
 * chapter's folders, each with how many loaded files it holds, then the files
 * shown, split by `tierByMarks`. One builder, so web's cards and s12's can't
 * come to disagree on what counts or in what order.
 */
export function markedItems<
  F extends { id: string; name: string; pinned_at?: string | null },
  D extends { id: string; folder: string | null; pinned_at?: string | null },
>({
  folders,
  library,
  shown,
  starredFolders,
  starredDocuments,
}: {
  /** The chapter's folders, in the officers' order. */
  folders: readonly F[];
  /** Every loaded file, for the folder counts. */
  library: readonly D[];
  /** The files shown, in the list's order. */
  shown: readonly D[];
  starredFolders: ReadonlySet<string>;
  starredDocuments: ReadonlySet<string>;
}): { pinned: MarkedItem<F, D>[]; starred: MarkedItem<F, D>[] } {
  const counts = new Map<string, number>();
  for (const doc of library) {
    if (doc.folder) counts.set(doc.folder, (counts.get(doc.folder) ?? 0) + 1);
  }
  const items: MarkedItem<F, D>[] = [
    ...folders.map((folder): MarkedItem<F, D> => ({
      kind: "folder",
      folder,
      count: counts.get(folder.name) ?? 0,
    })),
    ...shown.map((doc): MarkedItem<F, D> => ({ kind: "document", doc })),
  ];
  const { pinned, starred } = tierByMarks(
    items,
    (item) =>
      item.kind === "folder" ? !!item.folder.pinned_at : !!item.doc.pinned_at,
    (item) =>
      item.kind === "folder"
        ? starredFolders.has(item.folder.id)
        : starredDocuments.has(item.doc.id),
  );
  return { pinned, starred };
}

/** A list's rows with pinned files first, then starred, then the rest. */
export function tierRows<
  R extends { doc: { id: string; pinned_at?: string | null } },
>(rows: readonly R[], starredDocuments: ReadonlySet<string>): R[] {
  const tiers = tierByMarks(
    rows,
    (row) => !!row.doc.pinned_at,
    (row) => starredDocuments.has(row.doc.id),
  );
  return [...tiers.pinned, ...tiers.starred, ...tiers.rest];
}

/** Whether a document is a copy of a file in the chapter's Drive folder (#5157). */
export function isDriveCopy(doc: { drive_file_id?: string | null }): boolean {
  return typeof doc.drive_file_id === "string" && doc.drive_file_id !== "";
}

/**
 * Whether `userId` may upload a new version of this file (#6055), as the API
 * decides (`PUT /v1/documents/{id}/file`): its uploader, or a member who
 * manages documents, and either way only while they hold upload or manage,
 * since storing a new file is an upload. Never a Drive file, which is changed
 * in Drive, nor a meeting's minutes, which have no file.
 */
export function mayUploadNewVersion(
  doc: {
    uploaded_by?: string | null;
    drive_file_id?: string | null;
    meeting_id?: string | null;
  },
  userId: string | null,
  access: { uploads: boolean; manages: boolean },
): boolean {
  if (isDriveCopy(doc) || isMinutesDocument({ meeting_id: doc.meeting_id }))
    return false;
  if (access.manages) return true;
  return access.uploads && !!userId && doc.uploaded_by === userId;
}

/**
 * Whether the row is a copy from the chapter's connected Drive folder (#5157),
 * as the API tells it (`isDriveFolderCopy`): it has a Drive file and no link
 * status. A file added by its own Drive link (#5434) has a status. Drive
 * names and files a folder copy, so the next sync undoes any change here.
 */
export function isDriveFolderCopy(doc: {
  drive_file_id?: string | null;
  drive_link_status?: string | null;
}): boolean {
  return isDriveCopy(doc) && !doc.drive_link_status;
}

/**
 * Who may rename or move this file (#5563), as the API decides
 * (`assertMayRefile` behind `PATCH /v1/documents/{id}`): its uploader, or a
 * member who manages documents. Never a copy from the Drive folder, which is
 * renamed and moved in Drive. A move also needs the folder it leaves in
 * sight, which `mayMoveDocument` adds.
 */
export function mayRefileDocument(
  doc: {
    uploaded_by?: string | null;
    drive_file_id?: string | null;
    drive_link_status?: string | null;
  },
  userId: string | null,
  access: { manages: boolean },
): boolean {
  if (isDriveFolderCopy(doc)) return false;
  if (access.manages) return true;
  return !!userId && doc.uploaded_by === userId;
}

/**
 * Whether the member may move this file to another folder (#5563): who may
 * refile it (`mayRefileDocument`), once their folders have loaded and only
 * while the file's folder is one of them. The server refuses a move out of a
 * folder the mover can't see (`checkedMove`), and an uploader still sees
 * their own file in a folder whose list later left them off, so that file
 * offers no Move rather than one that is always refused. `folders` is `null`
 * until the member's folders load.
 */
export function mayMoveDocument(
  doc: {
    uploaded_by?: string | null;
    drive_file_id?: string | null;
    drive_link_status?: string | null;
    folder?: string | null;
  },
  userId: string | null,
  access: { manages: boolean; folders: readonly { name: string }[] | null },
): boolean {
  if (access.folders === null) return false;
  const folder = doc.folder ?? null;
  if (folder !== null && !access.folders.some((row) => row.name === folder)) {
    return false;
  }
  return mayRefileDocument(doc, userId, access);
}

/**
 * Whether the member may rename this file here (#5563): who may refile it,
 * except a file that takes its name from elsewhere. Minutes take their
 * meeting's name, and a file added by its Drive link keeps Drive's.
 */
export function mayRenameDocument(
  doc: {
    uploaded_by?: string | null;
    drive_file_id?: string | null;
    drive_link_status?: string | null;
    meeting_id?: string | null;
  },
  userId: string | null,
  access: { manages: boolean },
): boolean {
  if (isMinutesDocument({ meeting_id: doc.meeting_id })) return false;
  if (isDriveCopy(doc)) return false;
  return mayRefileDocument(doc, userId, access);
}

/**
 * Where a Drive file is renamed (#5563), said in its menu in place of
 * Rename, the way a Drive folder's ⋯ says it (`drive-folder-panel.tsx`).
 * The item opens the file in Drive.
 */
export const RENAME_IN_DRIVE_LABEL = "Rename in Google Drive";

/** The Rename question's commit, and its title on both apps. */
export const RENAME_DOCUMENT_TITLE = "Rename file";

/** The Move question's title on both apps. */
export const MOVE_DOCUMENT_TITLE = "Move to folder";

/** The no-folder choice: the folder rail's row, the upload and import folder picks, and Move to folder. */
export const NO_FOLDER_LABEL = "No folder";

/**
 * A Drive file's page in Google Drive (#6055), where its working copy is, or
 * null. Only an https link: the address goes in a link both apps open, and
 * Drive's `webViewLink` is always one.
 */
export function driveLink(doc: { drive_url?: string | null }): string | null {
  const url = doc.drive_url;
  return typeof url === "string" && url.startsWith("https://") ? url : null;
}

/** Under a folder's Who can see list: who passes it anyway (#3642 piece 1). */
export const FOLDER_ALWAYS_LINE = "The President can always see it.";

/** Under a file's list: its uploader passes too (a Drive copy has none). */
export const FILE_ALWAYS_LINE =
  "The President and whoever uploaded it can always see it.";

/** What the lock on a file not everyone can see says to a screen reader. */
export const LIMITED_LABEL = "Not everyone can see this";

type AccessListed = { who_can_see?: readonly string[] | null };

/**
 * What moving a file from one folder to another does to who sees it (#5563,
 * `spec/behavior/chapter-docs.md` § Rename and move), said before the move,
 * or null when nothing changes. A file is seen by who passes its folder's list
 * and its own (§ Who can see): into a folder with a list, only that list's
 * people see it, narrowed by its own; out of one into an open folder (or
 * none), everyone in the chapter does, or everyone on its own list.
 *
 * Both folders must be among `folders`, which `mayMoveDocument` holds to: a
 * folder missing from the list would read as open.
 */
export function moveAccessNote(
  doc: AccessListed,
  folders: readonly ({ name: string } & AccessListed)[],
  from: string | null,
  to: string | null,
): string | null {
  const listOf = (name: string | null) =>
    name === null
      ? null
      : (folders.find((folder) => folder.name === name)?.who_can_see ?? null);
  const key = (list: readonly string[] | null) =>
    list === null ? null : [...list].sort().join("\u0000");
  const fromList = listOf(from);
  const toList = listOf(to);
  if (key(fromList) === key(toList)) return null;
  const ownList = doc.who_can_see != null;
  if (toList !== null && to !== null) {
    return ownList
      ? `Only people who can see ${to} and are on the file's own list will see it.`
      : `Only people who can see ${to} will see it.`;
  }
  return ownList
    ? "Everyone on the file's own list will see it."
    : "Everyone in the chapter will see it.";
}

/**
 * Which files draw the lock (#5216), on web and the phone alike: a file with
 * its own list, one in a folder with a list, and one in a folder this member
 * can't see. The last is a file they uploaded before losing that folder
 * (`isOwnUpload` in the API): every folder a document names is registered
 * (an upload registers it, and the folders table was backfilled), so a
 * folder missing from the member's own list is one a list hides from them.
 * Until the folders load (`null`), only a file's own list counts, so nothing
 * draws a lock it then loses.
 */
export function limitedDocumentCheck(
  folders: readonly ({ name: string } & AccessListed)[] | null,
): (doc: { folder: string | null } & AccessListed) => boolean {
  const limited = new Map(
    (folders ?? []).map((folder) => [folder.name, folder.who_can_see != null]),
  );
  return (doc) => {
    if (doc.who_can_see != null) return true;
    if (!doc.folder || folders === null) return false;
    return limited.get(doc.folder) ?? true;
  };
}
