import { describe, expect, it } from "vitest";
import { formatWeekdayDay } from "@repo/formatting";
import {
  classifyFile,
  isMinutesDocument,
  toLibraryDocuments,
} from "@repo/hooks/document-library";
import {
  documentMeta,
  documentOpenHint,
  selectDocumentFolders,
  selectDocuments,
  selectDownloadUrl,
} from "./documents";

const NOW = new Date("2026-11-09T12:00:00Z");

/** A `GET /v1/documents?minutes=true` row that files a meeting's minutes. */
const MINUTES_ROW = {
  id: "d-m",
  title: "Chapter meeting",
  folder: "Minutes / Chapter meeting",
  document_type: "Minutes",
  uploaded_by: null,
  storage_path: null,
  created_at: "2026-11-04T02:00:00.000Z",
  meeting_id: "m-1",
  minutes: {
    meeting_id: "m-1",
    event_name: "Chapter meeting",
    event_start_time: "2026-11-03T23:00:00.000Z",
    meeting_type: "chapter",
    other_label: null,
    decision_count: 3,
    action_item_count: 5,
    recorded: true,
    gist: "Formal moved to April",
  },
};

function metaFor(
  rows: unknown,
  names: Record<string, string> = {},
): (string | null)[] {
  return toLibraryDocuments(
    selectDocuments(rows),
    (id) => names[id] ?? null,
  ).map((row) => documentMeta(row, NOW));
}

describe("selectDocuments", () => {
  it("narrows a document to the fields the library reads", () => {
    expect(
      selectDocuments([
        {
          id: "d-1",
          title: "Chapter bylaws",
          description: "Ratified 2025",
          folder: "Governance",
          document_type: "Bylaws",
          uploaded_by: "u-1",
          created_at: "2026-08-12T14:00:00.000Z",
          storage_path: "chapters/c/documents/x/bylaws.pdf",
          pinned_at: "2026-11-11T00:00:00.000Z",
        },
      ]),
    ).toEqual([
      {
        id: "d-1",
        title: "Chapter bylaws",
        description: "Ratified 2025",
        folder: "Governance",
        document_type: "Bylaws",
        effective_date: null,
        uploaded_by: "u-1",
        created_at: "2026-08-12T14:00:00.000Z",
        content_type: null,
        storage_path: "chapters/c/documents/x/bylaws.pdf",
        pinned_at: "2026-11-11T00:00:00.000Z",
        drive_file_id: null,
        meeting_id: null,
        minutes: null,
      },
    ]);
  });

  // A meeting's posted minutes, filed as a row with no file (#5949).
  it("keeps a minutes row's meeting and what its row shows of the minutes", () => {
    const [doc] = selectDocuments([MINUTES_ROW]);
    expect(doc!.meeting_id).toBe("m-1");
    expect(doc!.storage_path).toBeNull();
    expect(doc!.minutes).toEqual({
      meeting_id: "m-1",
      event_name: "Chapter meeting",
      event_start_time: "2026-11-03T23:00:00.000Z",
      meeting_type: "chapter",
      other_label: null,
      decision_count: 3,
      action_item_count: 5,
      recorded: true,
      gist: "Formal moved to April",
    });
    expect(isMinutesDocument(doc!)).toBe(true);
    expect(classifyFile(doc!).label).toBe("Minutes");
  });

  it("drops a malformed minutes block rather than drawing half of it", () => {
    const [doc] = selectDocuments([
      { ...MINUTES_ROW, minutes: { meeting_id: "m-1" } },
    ]);
    expect(doc!.minutes).toBeNull();
  });

  // A row with no id cannot be opened — opening is what this list does.
  it("drops a row with no id or no title", () => {
    expect(
      selectDocuments([
        { title: "No id" },
        { id: "d-1" },
        { id: "d-2", title: "Fine" },
      ]),
    ).toHaveLength(1);
  });

  it("keeps the Drive folder a synced folder came from", () => {
    expect(
      selectDocumentFolders([
        { id: "f-1", name: "Chapter files", drive_folder_id: "drive-1" },
        { id: "f-2", name: "Bylaws", drive_folder_id: null },
      ]),
    ).toEqual([
      { id: "f-2", name: "Bylaws", pinned_at: null },
      {
        id: "f-1",
        name: "Chapter files",
        pinned_at: null,
        drive_folder_id: "drive-1",
      },
    ]);
  });

  it("returns an empty list for an absent payload", () => {
    expect(selectDocuments(undefined)).toEqual([]);
  });
});

describe("documentMeta", () => {
  it("reads as web's row does: uploaded, by whom, then folder and type", () => {
    expect(
      metaFor(
        [
          {
            id: "d-1",
            title: "Bylaws",
            folder: "Governance",
            document_type: "Bylaws",
            uploaded_by: "u-1",
            created_at: "2026-08-12T14:00:00.000Z",
          },
        ],
        { "u-1": "Ryan Castellano" },
      ),
    ).toEqual(["Uploaded August 12 by Ryan Castellano · Governance · Bylaws"]);
  });

  it("says when it takes effect, as web's row does, unless that is the upload day", () => {
    expect(
      metaFor([
        {
          id: "d-1",
          title: "Bylaws",
          folder: "Governance",
          created_at: "2026-08-12T14:00:00.000Z",
          effective_date: "2026-09-01",
        },
        {
          id: "d-2",
          title: "Budget",
          created_at: "2026-08-12T14:00:00.000Z",
          effective_date: "2026-08-12",
        },
      ]),
    ).toEqual([
      "Uploaded August 12 · Governance · Effective September 1",
      "Uploaded August 12",
    ]);
  });

  it("says a Drive copy came from Google Drive, not who filed it (#5157)", () => {
    expect(
      metaFor(
        [
          {
            id: "d-1",
            title: "Minutes",
            folder: "Rush",
            uploaded_by: "u-1",
            created_at: "2026-08-12T14:00:00.000Z",
            drive_file_id: "drive-1",
          },
        ],
        { "u-1": "Ryan Castellano" },
      ),
    ).toEqual(["From Google Drive, added August 12 · Rush"]);
  });

  it("leaves off an uploader the roster can't name", () => {
    expect(
      metaFor([
        {
          id: "d-1",
          title: "Bylaws",
          uploaded_by: "u-gone",
          created_at: "2026-08-12T14:00:00.000Z",
        },
      ]),
    ).toEqual(["Uploaded August 12"]);
  });

  it("omits the line when nothing is known", () => {
    expect(metaFor([{ id: "d-1", title: "Loose file" }])).toEqual([null]);
  });

  // Web's `documentFacts`, the same words and order (#5949): the day the
  // meeting met, the folder, then what the minutes hold.
  it("reads a meeting's minutes as web's row does: the day it met, the folder, what they hold", () => {
    expect(metaFor([MINUTES_ROW], { "u-1": "Ryan Castellano" })).toEqual([
      [
        formatWeekdayDay("2026-11-03T23:00:00.000Z", NOW),
        "Minutes / Chapter meeting",
        "Recorded",
        "3 decisions",
        "5 action items",
      ].join(" · "),
    ]);
  });

  it("survives an unparseable timestamp without rendering Invalid Date", () => {
    expect(
      metaFor([
        { id: "d-1", title: "Odd", folder: "Ops", created_at: "not-a-date" },
      ]),
    ).toEqual(["Ops"]);
  });
});

describe("documentOpenHint", () => {
  it("says a file opens the share sheet", () => {
    const [doc] = selectDocuments([{ id: "d-1", title: "Bylaws" }]);
    expect(documentOpenHint(doc!)).toBe(
      "Opens the share sheet to save it or open it in another app.",
    );
  });

  // The TL;DR line a phone row has no room to draw is still spoken (#5949).
  it("says a meeting's minutes open the minutes, after the TL;DR's line", () => {
    const [doc] = selectDocuments([MINUTES_ROW]);
    expect(documentOpenHint(doc!)).toBe(
      "Formal moved to April. Opens the minutes.",
    );
    const [bare] = selectDocuments([
      { ...MINUTES_ROW, minutes: { ...MINUTES_ROW.minutes, gist: null } },
    ]);
    expect(documentOpenHint(bare!)).toBe("Opens the minutes.");
  });
});

describe("selectDocumentFolders", () => {
  it("orders folders by sort_order, then by name", () => {
    expect(
      selectDocumentFolders([
        { id: "f-2", name: "Finance", sort_order: 2 },
        {
          id: "f-1",
          name: "Governance",
          sort_order: 1,
          pinned_at: "2026-11-11T00:00:00.000Z",
        },
        { id: "f-3", name: "Alumni", sort_order: 2 },
      ]),
    ).toEqual([
      { id: "f-1", name: "Governance", pinned_at: "2026-11-11T00:00:00.000Z" },
      { id: "f-3", name: "Alumni", pinned_at: null },
      { id: "f-2", name: "Finance", pinned_at: null },
    ]);
  });

  it("treats a missing sort_order as first rather than dropping the folder", () => {
    expect(
      selectDocumentFolders([
        { id: "f-1", name: "Ordered", sort_order: 5 },
        { id: "f-2", name: "Unordered" },
      ]).map((folder) => folder.name),
    ).toEqual(["Unordered", "Ordered"]);
  });

  it("returns an empty list for an absent payload", () => {
    expect(selectDocumentFolders(undefined)).toEqual([]);
  });
});

describe("selectDownloadUrl", () => {
  // The whole reason this is a named selector: the service returns `downloadUrl`
  // and there is no case-transforming interceptor, so the snake_case spelling
  // web reads yields `undefined` and a dead tap.
  it("reads the camelCase key the service actually returns", () => {
    expect(
      selectDownloadUrl({ id: "d-1", downloadUrl: "https://signed/url" }),
    ).toBe("https://signed/url");
  });

  it("accepts a snake_case key too, so a server rename cannot break the tap", () => {
    expect(selectDownloadUrl({ download_url: "https://signed/url" })).toBe(
      "https://signed/url",
    );
  });

  it("returns null when there is no url to open", () => {
    expect(selectDownloadUrl(undefined)).toBeNull();
    expect(selectDownloadUrl({ id: "d-1" })).toBeNull();
    expect(selectDownloadUrl({ downloadUrl: "" })).toBeNull();
  });
});
