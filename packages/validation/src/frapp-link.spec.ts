import { describe, expect, it } from "vitest";
import {
  FRAPP_LINKS_MAX,
  FRAPP_LINK_NOT_PUBLIC_MESSAGE,
  frappLinkKey,
  frappLinkRow,
  frappLinkTitle,
  frappLinkUrlProblem,
  frappLinkWebHref,
  frappWebLinkTitle,
  parseFrappAppLink,
  readFrappLinks,
  withEventLinkTitles,
  sameFrappLinks,
  frappLinkCandidateDetail,
  withFrappLink,
  type FrappLink,
} from "./frapp-link";

describe("readFrappLinks", () => {
  it("reads every kind and drops what it can't open", () => {
    expect(
      readFrappLinks([
        { id: "1", kind: "link", url: "https://a.example", title: "A" },
        { id: "2", kind: "document", document_id: "d1", title: "Bylaws" },
        { id: "3", kind: "document", document_id: "d2" },
        { id: "4", kind: "minutes", meeting_id: "m1", title: "Minutes" },
        { id: "5", kind: "event", event_id: "e1" },
        { id: "6", kind: "message", channel_id: "c1", message_id: "x1" },
        { id: "7", kind: "message", channel_id: "c1" },
        { id: "8", kind: "link", title: "no url" },
        { id: "9", kind: "link", url: "javascript:alert(1)", title: "bad" },
        { id: "10", kind: "file", title: "unknown kind" },
        { kind: "event", event_id: "no id" },
        null,
      ]),
    ).toEqual([
      { id: "1", kind: "link", url: "https://a.example", title: "A" },
      { id: "2", kind: "document", document_id: "d1", title: "Bylaws" },
      { id: "3", kind: "document", document_id: "d2" },
      { id: "4", kind: "minutes", meeting_id: "m1", title: "Minutes" },
      { id: "5", kind: "event", event_id: "e1" },
      { id: "6", kind: "message", channel_id: "c1", message_id: "x1" },
    ]);
    expect(readFrappLinks("x")).toEqual([]);
  });

  it("titles a stored web link with no title by its domain", () => {
    expect(
      readFrappLinks([
        { id: "1", kind: "link", url: "https://www.a.example/x" },
      ]),
    ).toEqual([
      {
        id: "1",
        kind: "link",
        url: "https://www.a.example/x",
        title: "a.example",
      },
    ]);
  });
});

describe("web link helpers", () => {
  it("titles an untitled link by its domain", () => {
    expect(frappWebLinkTitle("  ", "https://www.docs.example.com/x")).toBe(
      "docs.example.com",
    );
    expect(frappWebLinkTitle(" Budget ", "https://a.example")).toBe("Budget");
  });

  it("cuts every title to the API's limit", () => {
    expect(frappLinkTitle(`  ${"x".repeat(300)}  `)).toHaveLength(120);
    expect(frappLinkTitle(" Spring   budget ")).toBe("Spring budget");
  });

  it("says why a link can't be attached", () => {
    expect(frappLinkUrlProblem("https://a.example")).toBeNull();
    expect(frappLinkUrlProblem("")).toMatch(/Paste/);
    expect(frappLinkUrlProblem("ftp://a.example")).toMatch(/http/);
    expect(
      frappLinkUrlProblem(`https://a.example/${"x".repeat(2100)}`),
    ).toMatch(/too long/);
  });

  it.each([
    "https://test",
    "http://localhost:3000",
    "https://192.168.1.20",
    "https://printer.local",
  ])("refuses %s, which no phone can open (#5883)", (url) => {
    expect(frappLinkUrlProblem(url)).toBe(FRAPP_LINK_NOT_PUBLIC_MESSAGE);
  });
});

describe("frappLinkRow for a web link", () => {
  it("opens a public site, showing its domain", () => {
    expect(
      frappLinkRow({
        id: "1",
        kind: "link",
        url: "https://docs.google.com/d/1",
        title: "Budget",
      }),
    ).toEqual({
      name: "Budget",
      detail: "docs.google.com",
      opens: true,
      pending: false,
    });
  });

  it("draws one stored before #5883 that no phone can open as text", () => {
    expect(
      frappLinkRow({
        id: "1",
        kind: "link",
        url: "https://test",
        title: "Old notes",
      }),
    ).toEqual({
      name: "Old notes",
      detail: "test · not a working link",
      opens: false,
      pending: false,
    });
  });
});

describe("withFrappLink", () => {
  const id = () => "new";
  it("adds once, and never past the cap", () => {
    const one = withFrappLink([], { kind: "event", event_id: "e1" }, id);
    expect(one).toEqual([{ id: "new", kind: "event", event_id: "e1" }]);
    expect(withFrappLink(one, { kind: "event", event_id: "e1" }, id)).toEqual(
      one,
    );
    const full: FrappLink[] = Array.from(
      { length: FRAPP_LINKS_MAX },
      (_, i) => ({
        id: String(i),
        kind: "event",
        event_id: `e${i + 10}`,
      }),
    );
    expect(withFrappLink(full, { kind: "event", event_id: "x" }, id)).toEqual(
      full,
    );
  });

  it("keys a record by its id, whatever its list id", () => {
    expect(
      frappLinkKey({ kind: "message", channel_id: "c", message_id: "m" }),
    ).toBe("message:m");
    expect(frappLinkKey({ kind: "link", url: "https://a.example" })).toBe(
      "link:https://a.example",
    );
  });
});

describe("parseFrappAppLink", () => {
  const origins = ["https://app.staging.frapp.live"];
  it("reads each record address on the app's origins", () => {
    expect(
      parseFrappAppLink("https://app.frapp.live/documents?document=d1"),
    ).toEqual({ kind: "document", document_id: "d1" });
    expect(
      parseFrappAppLink(
        "https://app.staging.frapp.live/events?event=e1",
        origins,
      ),
    ).toEqual({ kind: "event", event_id: "e1" });
    expect(parseFrappAppLink("https://app.frapp.live/meetings/m1")).toEqual({
      kind: "minutes",
      meeting_id: "m1",
    });
    // A malformed escape names nothing rather than throwing mid-render.
    expect(parseFrappAppLink("https://app.frapp.live/meetings/%E0%A4%A")).toBe(
      null,
    );
    expect(
      parseFrappAppLink("https://app.frapp.live/chat?channel=c1&message=x1"),
    ).toEqual({ kind: "message", channel_id: "c1", message_id: "x1" });
  });

  it("leaves every other address a web link", () => {
    expect(
      parseFrappAppLink("https://app.frapp.live/chat?channel=c1"),
    ).toBeNull();
    expect(
      parseFrappAppLink("https://evil.example/events?event=e1"),
    ).toBeNull();
    expect(
      parseFrappAppLink("https://app.staging.frapp.live/events?event=e1"),
    ).toBeNull();
    expect(parseFrappAppLink("https://app.frapp.live/meetings")).toBeNull();
    expect(parseFrappAppLink("not a url")).toBeNull();
  });

  it("round-trips the web's own href for each record", () => {
    const links: FrappLink[] = [
      { id: "1", kind: "document", document_id: "d1" },
      { id: "2", kind: "minutes", meeting_id: "m1" },
      { id: "3", kind: "event", event_id: "e1" },
      { id: "4", kind: "message", channel_id: "c1", message_id: "x1" },
    ];
    for (const link of links) {
      const parsed = parseFrappAppLink(
        `https://app.frapp.live${frappLinkWebHref(link)}`,
      );
      expect(parsed && frappLinkKey(parsed)).toBe(
        frappLinkKey(link as Exclude<FrappLink, { kind: "link" }>),
      );
    }
  });
});

describe("frappLinkRow", () => {
  const now = new Date("2026-11-23T12:00:00Z");
  const doc: FrappLink = { id: "1", kind: "document", document_id: "d1" };
  it("shows a record's live name, and never a hidden one's", () => {
    expect(frappLinkRow(doc, undefined, now)).toMatchObject({
      name: "Document",
      pending: true,
    });
    // A pending row never shows a stored title: it may be a name this
    // reader can't open.
    expect(
      frappLinkRow({ ...doc, title: "Secret plans" }, undefined, now).name,
    ).toBe("Document");
    expect(
      frappLinkRow(
        doc,
        {
          key: "document:d1",
          state: "ok",
          title: "Bylaws",
          date: null,
          author: null,
        },
        now,
      ),
    ).toEqual({
      name: "Bylaws",
      detail: "Chapter Files",
      opens: true,
      pending: false,
    });
    expect(
      frappLinkRow(
        { ...doc, title: "Old name" },
        {
          key: "document:d1",
          state: "hidden",
          title: null,
          date: null,
          author: null,
        },
        now,
      ),
    ).toEqual({
      name: "You don't have access",
      detail: "Document",
      opens: false,
      pending: false,
    });
    expect(
      frappLinkRow(
        doc,
        {
          key: "document:d1",
          state: "removed",
          title: null,
          date: null,
          author: null,
        },
        now,
      ).opens,
    ).toBe(false);
  });

  it("names a message by its channel and sender", () => {
    expect(
      frappLinkRow(
        { id: "1", kind: "message", channel_id: "c", message_id: "m" },
        {
          key: "message:m",
          state: "ok",
          title: "general",
          date: "2026-11-16T18:00:00Z",
          author: "Moiz",
        },
        now,
      ),
    ).toMatchObject({ name: "#general", detail: "Moiz · Nov 16" });
  });

  it("reads a web link with no resolve", () => {
    expect(
      frappLinkRow(
        {
          id: "1",
          kind: "link",
          url: "https://docs.google.com/x",
          title: "IFC calendar",
        },
        undefined,
        now,
      ),
    ).toEqual({
      name: "IFC calendar",
      detail: "docs.google.com",
      opens: true,
      pending: false,
    });
  });
});

describe("withEventLinkTitles", () => {
  it("titles every record by its kind, never by a name it held", () => {
    const links: FrappLink[] = [
      { id: "1", kind: "link", url: "https://a.example", title: "A" },
      { id: "2", kind: "document", document_id: "d1", title: "Bylaws" },
      { id: "4", kind: "minutes", meeting_id: "m1", title: "Old name" },
      { id: "5", kind: "message", channel_id: "c1", message_id: "x1" },
    ];
    expect(withEventLinkTitles(links).map((link) => link.title)).toEqual([
      "A",
      "Document",
      "Minutes",
      "Message",
    ]);
  });
});

describe("sameFrappLinks", () => {
  it("ignores key order and an event record's stored title", () => {
    const a: FrappLink[] = [
      { id: "1", kind: "document", document_id: "d1" },
      { id: "2", kind: "link", url: "https://a.example", title: "A" },
    ];
    const reordered = [
      { document_id: "d1", kind: "document", id: "1", title: "Document" },
      { title: "A", url: "https://a.example", kind: "link", id: "2" },
    ] as FrappLink[];
    expect(sameFrappLinks(a, reordered)).toBe(true);
    expect(sameFrappLinks(a, [a[0]!])).toBe(false);
    expect(
      sameFrappLinks(a, [a[0]!, { ...(a[1] as FrappWebLinkLike), title: "B" }]),
    ).toBe(false);
  });
});

type FrappWebLinkLike = Extract<FrappLink, { kind: "link" }>;

describe("frappLinkCandidateDetail", () => {
  const now = new Date("2026-11-23T12:00:00Z");
  it("reads as the row will once attached", () => {
    expect(frappLinkCandidateDetail("document", null, now)).toBe(
      "Chapter Files",
    );
    expect(
      frappLinkCandidateDetail("minutes", "2026-11-16T18:00:00Z", now),
    ).toBe("Minutes · Nov 16");
    expect(frappLinkCandidateDetail("event", null, now)).toBe("Event");
  });
});
