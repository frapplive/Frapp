import { describe, expect, it } from "vitest";
import { SYSTEM_SENDER_ID } from "@repo/validation";
import {
  dmChannelIdOf,
  NEW_GROUP_NOT_MEMBERS,
  NEW_MESSAGE_MAX_PEOPLE,
  newGroupFailedBody,
  newMessageButton,
  messageableMembers,
  normalizeDmSearchText,
  searchDirectMessages,
  type DmSearchConversation,
  type DmSearchInput,
} from "./dm-search";

const VIEWER = "viewer";
const names = {
  [VIEWER]: "Shawn Klein",
  paul: "Paul Carlson",
  pauline: "Pauline Park",
  winston: "Winston Lee",
  evan: "Evan Ruiz",
  jose: "José Alvarez",
  blocked: "Paula Blocked",
  hidden: "Paulo Hidden",
};
const roster = Object.entries(names).map(([user_id, display_name]) => ({
  user_id,
  display_name,
}));

type Row = DmSearchConversation & { title: string };
const dm = (id: string, other: string): Row => ({
  id,
  type: "DM",
  member_ids: [VIEWER, other],
  title: names[other as keyof typeof names],
});

function run(query: string, overrides: Partial<DmSearchInput<Row>> = {}) {
  return searchDirectMessages<Row>({
    query,
    conversations: [
      dm("dm-winston", "winston"),
      {
        id: "group",
        type: "GROUP_DM",
        member_ids: [VIEWER, "evan", "pauline"],
        title: "Rush crew",
      },
      dm("dm-paul", "paul"),
    ],
    titleOf: (row) => row.title,
    roster,
    names,
    viewerId: VIEWER,
    blockedIds: new Set(["blocked"]),
    blockListReady: true,
    ...overrides,
  });
}

const ids = (rows: { id: string }[]) => rows.map((row) => row.id);
const userIds = (rows: { user_id: string }[]) => rows.map((row) => row.user_id);

describe("searchDirectMessages", () => {
  it("lists the existing conversation first, then members with none", () => {
    const result = run("Paul");
    // Both start with "Paul" (the group has Pauline); the 1:1 leads a tie.
    expect(ids(result.conversations)).toEqual(["dm-paul", "group"]);
    // Paul has a DM, so he is found as that row, not again as a member.
    // Pauline is only in a group, so a 1:1 with her is still offered.
    expect(userIds(result.members)).toEqual(["pauline", "hidden"]);
    expect(result.membersHeld).toBe(false);
  });

  it("matches a group DM on any member's name, not only its title", () => {
    expect(ids(run("evan").conversations)).toEqual(["group"]);
    expect(ids(run("rush").conversations)).toEqual(["group"]);
  });

  it("never offers a blocked member, the viewer or the system actor", () => {
    const result = run("a", {
      roster: [...roster, { user_id: SYSTEM_SENDER_ID, display_name: "Frapp" }],
    });
    const offered = userIds(result.members);
    expect(offered).not.toContain("blocked");
    expect(offered).not.toContain(VIEWER);
    expect(offered).not.toContain(SYSTEM_SENDER_ID);
  });

  it("holds members back until the block list is read, keeping conversations", () => {
    const result = run("Paul", { blockListReady: false });
    expect(ids(result.conversations)).toEqual(["dm-paul", "group"]);
    expect(result.members).toEqual([]);
    expect(result.membersHeld).toBe(true);
  });

  it("holds members back while the viewer is unknown", () => {
    expect(run("Paul", { viewerId: null }).membersHeld).toBe(true);
  });

  it("matches no conversation on the viewer's own name while the viewer is unknown", () => {
    // Every conversation holds the viewer; with no id to leave them out, their
    // name would match them all.
    expect(run("Shawn", { viewerId: null }).conversations).toEqual([]);
  });

  it("ranks a word that starts with the text above a name that only contains it", () => {
    const result = run("lee", {
      conversations: [],
      roster: [
        { user_id: "ashlee", display_name: "Ashlee Ford" },
        { user_id: "winston", display_name: "Winston Lee" },
      ],
    });
    expect(userIds(result.members)).toEqual(["winston", "ashlee"]);
  });

  it("offers the member of a hidden DM, since picking them reopens it", () => {
    // `hidden` has no listed conversation (hidden ones are left out).
    expect(userIds(run("Paulo").members)).toEqual(["hidden"]);
  });

  it("ignores case and accents and ranks name starts first", () => {
    expect(userIds(run("JOSE").members)).toEqual(["jose"]);
    // "park" is in the group only, through Pauline Park.
    expect(ids(run("park").conversations)).toEqual(["group"]);
  });

  it("returns the whole list, untouched, for an empty query", () => {
    const result = run("   ");
    expect(ids(result.conversations)).toEqual([
      "dm-winston",
      "group",
      "dm-paul",
    ]);
    expect(result.members).toEqual([]);
  });
});

describe("normalizeDmSearchText", () => {
  it("lowercases, strips accents and collapses spaces", () => {
    expect(normalizeDmSearchText("  José   ÁLVAREZ ")).toBe("jose alvarez");
  });
});

describe("dmChannelIdOf", () => {
  it("reads the channel id from the DM response", () => {
    expect(dmChannelIdOf({ id: "c1", type: "DM" })).toBe("c1");
  });

  // Every case a caller must report as a failure rather than open a thread
  // with no id (moved from the phone's start-dm spec with the reader).
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a bare string", "c1"],
    ["a body with no id", { type: "DM" }],
    ["an empty id", { id: "" }],
    ["a non-string id", { id: 42 }],
  ])("returns null for %s", (_, body) => {
    expect(dmChannelIdOf(body)).toBeNull();
  });
});

describe("New message (#6190)", () => {
  const roster = [
    { user_id: VIEWER, display_name: "Shawn Klein" },
    { user_id: "paul", display_name: "Paul Carlson" },
    { user_id: SYSTEM_SENDER_ID, display_name: "Frapp" },
    { user_id: "blocked", display_name: "Paula Blocked" },
    { user_id: "paul", display_name: "Paul Carlson" },
    { user_id: "winston", display_name: "Winston Lee" },
  ];

  it("offers the roster but you, the system actor and who you blocked, once each", () => {
    expect(
      messageableMembers({
        roster,
        viewerId: VIEWER,
        blockedIds: new Set(["blocked"]),
        blockListReady: true,
      }).map((member) => member.user_id),
    ).toEqual(["paul", "winston"]);
  });

  it("offers nobody until the viewer and the block list are known", () => {
    const base = { roster, blockedIds: new Set<string>() };
    expect(
      messageableMembers({ ...base, viewerId: null, blockListReady: true }),
    ).toEqual([]);
    expect(
      messageableMembers({ ...base, viewerId: VIEWER, blockListReady: false }),
    ).toEqual([]);
  });

  it("names its button by the count, up to a group DM's size", () => {
    expect(newMessageButton(0)).toBe("Message");
    expect(newMessageButton(1)).toBe("Message");
    expect(newMessageButton(2)).toBe("Message 2 people");
    expect(newMessageButton(NEW_MESSAGE_MAX_PEOPLE)).toBe("Message 9 people");
    expect(newMessageButton(NEW_MESSAGE_MAX_PEOPLE + 1)).toBe("Up to 9 people");
  });

  it("says who left on a 404, to wait on a 429, and the fallback otherwise", () => {
    expect(newGroupFailedBody({ statusCode: 404 }, "fallback")).toBe(
      NEW_GROUP_NOT_MEMBERS,
    );
    expect(newGroupFailedBody({ statusCode: 429 }, "fallback")).toMatch(
      /Wait a minute/,
    );
    expect(newGroupFailedBody({ statusCode: 500 }, "fallback")).not.toBe(
      NEW_GROUP_NOT_MEMBERS,
    );
  });

  it("stops at a group DM's size, the creator included", () => {
    expect(NEW_MESSAGE_MAX_PEOPLE).toBe(9);
  });
});
